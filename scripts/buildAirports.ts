/**
 * buildAirports.ts — Build a committed, network-free airports fallback dataset.
 *
 * Usage:
 *   npm run build:airports
 *   (i.e. tsx scripts/buildAirports.ts)
 *
 * Downloads the public-domain OurAirports dataset, filters it to real airports
 * (large/medium/small), resolves a 4-letter ICAO code for each, and writes a
 * COMPACT JSON map { "ICAO": [city, name] } to src/lib/airports.fallback.json
 * with keys sorted alphabetically so diffs are deterministic.
 *
 * There is intentionally NO network dependency at runtime: this script is the
 * only place that fetches data, and its output is committed.
 */

import { writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE_URL =
  'https://davidmegginson.github.io/ourairports-data/airports.csv';

const OUTPUT_PATH = join(__dirname, '..', 'src', 'lib', 'airports.fallback.json');

/** Airport types we keep, in priority order (highest first). */
const KEPT_TYPES = ['large_airport', 'medium_airport', 'small_airport'] as const;
type KeptType = (typeof KEPT_TYPES)[number];

const TYPE_PRIORITY: Record<KeptType, number> = {
  large_airport: 3,
  medium_airport: 2,
  small_airport: 1,
};

const ICAO_RE = /^[A-Z]{4}$/;

/**
 * Parse CSV text into rows of string fields.
 *
 * Handles:
 *  - quoted fields that contain commas, newlines, and doubled quotes ("")
 *  - both \r\n and \n line endings
 *
 * Returns an array of rows; each row is an array of field strings.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  // Tracks whether the current row has seen any content, so we don't emit a
  // spurious trailing empty row on a final newline.
  let rowHasContent = false;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
    rowHasContent = false;
  };

  while (i < n) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          // Escaped doubled quote inside a quoted field.
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      rowHasContent = true;
      i += 1;
      continue;
    }

    if (ch === ',') {
      endField();
      rowHasContent = true;
      i += 1;
      continue;
    }

    if (ch === '\r') {
      // Handle \r\n (and a lone \r) as a single line terminator.
      if (rowHasContent || field.length > 0 || row.length > 0) {
        endRow();
      }
      if (text[i + 1] === '\n') i += 2;
      else i += 1;
      continue;
    }

    if (ch === '\n') {
      if (rowHasContent || field.length > 0 || row.length > 0) {
        endRow();
      }
      i += 1;
      continue;
    }

    field += ch;
    rowHasContent = true;
    i += 1;
  }

  // Flush any trailing field/row not terminated by a newline.
  if (field.length > 0 || row.length > 0) {
    endRow();
  }

  return rows;
}

async function main(): Promise<void> {
  console.log(`Downloading ${SOURCE_URL} ...`);

  let csvText: string;
  try {
    const res = await fetch(SOURCE_URL);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    csvText = await res.text();
  } catch (err) {
    console.error('FATAL: failed to download OurAirports dataset.');
    console.error(err instanceof Error ? err.stack ?? err.message : String(err));
    process.exit(1);
    return;
  }

  const rows = parseCsv(csvText);
  if (rows.length === 0) {
    console.error('FATAL: CSV parsed into zero rows.');
    process.exit(1);
    return;
  }

  const header = rows[0];
  const colIndex = (name: string): number => {
    const idx = header.indexOf(name);
    if (idx === -1) {
      throw new Error(`Expected column "${name}" not found in CSV header.`);
    }
    return idx;
  };

  const idxType = colIndex('type');
  const idxName = colIndex('name');
  const idxMunicipality = colIndex('municipality');
  const idxIdent = colIndex('ident');
  const idxIcaoCode = colIndex('icao_code');
  const idxGpsCode = colIndex('gps_code');

  const dataRows = rows.slice(1);
  const totalParsed = dataRows.length;

  /** ICAO -> [city, name, typePriority] (priority kept only during build). */
  const result = new Map<string, { city: string; name: string; priority: number }>();

  for (const cols of dataRows) {
    const type = (cols[idxType] ?? '').trim();
    if (!KEPT_TYPES.includes(type as KeptType)) continue;

    const name = (cols[idxName] ?? '').trim();
    if (name === '') continue;

    // Resolve ICAO: first of icao_code, gps_code, ident matching ^[A-Z]{4}$.
    const candidates = [
      cols[idxIcaoCode],
      cols[idxGpsCode],
      cols[idxIdent],
    ];
    let icao = '';
    for (const c of candidates) {
      const v = (c ?? '').trim().toUpperCase();
      if (ICAO_RE.test(v)) {
        icao = v;
        break;
      }
    }
    if (icao === '') continue;

    const city = (cols[idxMunicipality] ?? '').trim();
    const priority = TYPE_PRIORITY[type as KeptType];

    const existing = result.get(icao);
    if (existing === undefined) {
      result.set(icao, { city, name, priority });
    } else if (priority > existing.priority) {
      // Prefer higher-priority type (large > medium > small).
      result.set(icao, { city, name, priority });
    }
    // On tie or lower priority, keep the first (existing) — do nothing.
  }

  const keptCount = result.size;

  // Build a compact, alphabetically-sorted object map.
  const sortedKeys = [...result.keys()].sort();
  const out: Record<string, [string, string]> = {};
  for (const key of sortedKeys) {
    const v = result.get(key)!;
    out[key] = [v.city, v.name];
  }

  const json = JSON.stringify(out);
  writeFileSync(OUTPUT_PATH, json);

  const sizeBytes = statSync(OUTPUT_PATH).size;

  console.log('--- buildAirports summary ---');
  console.log(`Total rows parsed: ${totalParsed}`);
  console.log(`Kept (filtered):   ${keptCount}`);
  console.log(`Output file:       ${OUTPUT_PATH}`);
  console.log(`Output size:       ${sizeBytes} bytes (${(sizeBytes / 1024).toFixed(1)} KiB)`);
}

main().catch((err) => {
  console.error('FATAL: unexpected error.');
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
