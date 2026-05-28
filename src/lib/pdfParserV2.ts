/**
 * pdfParserV2 — Coordinate-based parser for Cybermax FBO PDFs
 *
 * Uses pdfjs-dist v3 (CJS) directly to access X,Y coordinates of each text
 * item. v3's legacy build is CommonJS-compatible, so Next.js can keep it as a
 * serverExternalPackage and require() it at runtime without ERR_REQUIRE_ESM.
 * Setting workerSrc = '' triggers the inline FakeWorker (no real Worker needed).
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf');
pdfjsLib.GlobalWorkerOptions.workerSrc = '';

// Company header text as it appears in the flight sheet PDF — override via FBO_COMPANY_NAME env var
const FBO_HEADER = (process.env.FBO_COMPANY_NAME ?? 'FBO').toUpperCase();

export type FlightType = 'HANDLING' | 'EXTERNAL_SERVICE' | 'LOUNGE_GUEST';

export interface ParsedFlight {
  callsign: string;
  origin: string;
  prevDate: string;
  arrTime: string;
  registration: string;
  aircraft: string;
  parking: string;
  crewArr: string;
  crewDep: string;
  paxArr: string;
  paxDep: string;
  depCallsign: string;
  destination: string;
  depDate: string;
  depTime: string;
  flightType: FlightType;
}

export interface ParseWarning {
  /** 1-based logical row index within the page (after Y-merging), for context. */
  row: number;
  reason: string;
}

export interface ParseResult {
  sheetDate: string;
  flights: ParsedFlight[];
  errors: string[];
  warnings: ParseWarning[];
}

// Kept as the single source of truth for column anchors; COLUMN_RANGES is derived
// from it and `ColumnName` is `keyof typeof COLUMNS`, so it's used as a type only.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const COLUMNS = {
  arr_callsign: { x: 20,  width: 50 },
  origin:       { x: 71,  width: 40 },
  prev_date:    { x: 114, width: 40 },
  arr_time:     { x: 156, width: 25 },
  registration: { x: 185, width: 50 },
  aircraft:     { x: 236, width: 30 },
  loc:          { x: 270, width: 30 },
  parking:      { x: 303, width: 50 },
  crew_arr:     { x: 352, width: 5  },
  crew_sep:     { x: 362, width: 4  },
  crew_dep:     { x: 368, width: 8  },
  pax_arr:      { x: 387, width: 4  },
  pax_sep:      { x: 395, width: 3  },
  pax_dep:      { x: 399, width: 8  },
  dep_callsign: { x: 418, width: 45 },
  destination:  { x: 467, width: 40 },
  dep_date:     { x: 509, width: 40 },
  dep_time:     { x: 549, width: 30 },
} as const;

type ColumnName = keyof typeof COLUMNS;

/**
 * Maps an X coordinate to a column name using explicit non-overlapping
 * [lo, hi] boundaries.
 *
 * WHY: the old approach (cx-5, cx+width, first-match) produced three
 * overlapping ranges that silently discarded data when Cybermax shifted a
 * column 1-2 px:
 *   parking  [298,353] ↔ crew_arr [347,357]  — overlap [347,353]
 *   crew_sep [357,366] ↔ crew_dep [363,376]  — overlap [363,366]
 *   pax_sep  [390,398] ↔ pax_dep  [394,407]  — overlap [394,398]
 *
 * The new boundaries are derived by clipping each right edge at the midpoint
 * between adjacent anchors, ensuring every x maps to exactly one column:
 *
 *   parking:      [298, 346]   (clipped; crew_arr starts at 347)
 *   crew_arr:     [347, 357]   (unchanged)
 *   crew_sep:     [358, 364]   (starts after crew_arr 357; midpoint(362,368)=365 → sep ends 364)
 *   crew_dep:     [365, 376]   (left edge moved from 363 → 365)
 *   pax_arr:      [382, 391]   (unchanged)
 *   pax_sep:      [392, 396]   (midpoint(395,399)=397 → sep ends 396)
 *   pax_dep:      [397, 407]   (left edge moved from 394 → 397)
 *
 * Real PDF coordinates confirmed safe:
 *   parking digit 313.83 → parking ✓
 *   crew_arr digit 355.74 → crew_arr ✓
 *   "/"          361.72  → crew_sep ✓  (absorbed, no switch case)
 *   crew_dep digit 367.5  → crew_dep ✓
 *   pax_arr digit  387.24 → pax_arr  ✓
 *   "/"          394.72  → pax_sep  ✓  (absorbed, no switch case)
 *   pax_dep digit  399    → pax_dep  ✓
 */
const COLUMN_RANGES: [ColumnName, number, number][] = [
  ['arr_callsign', 15,  70 ],
  ['origin',       66,  113],
  ['prev_date',    109, 153],
  ['arr_time',     151, 181],
  ['registration', 180, 233],
  ['aircraft',     231, 267],
  ['loc',          265, 298],
  ['parking',      298, 346],   // right edge clipped: was 353, now 346
  ['crew_arr',     347, 357],
  ['crew_sep',     358, 364],   // left edge 358 (starts after crew_arr's 357); right edge clipped: was 366, now 364
  ['crew_dep',     365, 376],   // left edge moved: was 363, now 365
  ['pax_arr',      382, 391],
  ['pax_sep',      392, 396],   // left edge moved: was 390→392; right edge: was 398→396
  ['pax_dep',      397, 407],   // left edge moved: was 394, now 397
  ['dep_callsign', 413, 462],
  ['destination',  463, 507],
  ['dep_date',     504, 547],
  ['dep_time',     544, 579],
];

function findColumn(x: number): ColumnName | null {
  for (const [name, lo, hi] of COLUMN_RANGES) {
    if (x >= lo && x <= hi) return name;
  }
  return null;
}

function detectFlightType(callsign: string, registration: string): FlightType {
  const cs = (callsign || '').toUpperCase();
  const reg = (registration || '').toUpperCase();
  if (cs.startsWith('CAT')) return 'EXTERNAL_SERVICE';
  if (cs === 'ZJONES' || reg === 'Z-JONES' || reg.includes('JONES')) return 'LOUNGE_GUEST';
  return 'HANDLING';
}

export interface PdfItem {
  text: string;
  x: number;
  y: number;
  page: number;
}

export function parsePageItems(items: PdfItem[], isFirstPage: boolean, pageNum = 1): { sheetDate: string; flights: ParsedFlight[]; errors: string[]; warnings: ParseWarning[] } {
  const errors: string[] = [];
  // Group items by rounded Y
  const rowsByY = new Map<number, PdfItem[]>();
  for (const it of items) {
    const yKey = Math.round(it.y);
    if (!rowsByY.has(yKey)) rowsByY.set(yKey, []);
    rowsByY.get(yKey)!.push(it);
  }

  // Sort rows top→bottom (descending Y in PDF coords)
  const rows = [...rowsByY.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([y, rowItems]) => ({ y, items: rowItems.sort((a, b) => a.x - b.x) }));

  // Merge rows whose Y differs by ≤1 point (Cybermax two-line flight rows)
  const merged: { y: number; items: PdfItem[] }[] = [];
  for (const row of rows) {
    const prev = merged[merged.length - 1];
    if (prev && Math.abs(prev.y - row.y) <= 1) {
      prev.items.push(...row.items);
    } else {
      merged.push({ y: row.y, items: [...row.items] });
    }
  }
  for (const row of merged) row.items.sort((a, b) => a.x - b.x);

  let sheetDate = '';
  if (isFirstPage) {
    for (const row of merged) {
      if (row.y < 700) break;
      const m = row.items.find(it => /^\d{2}\/\d{2}\/\d{2}$/.test(it.text));
      if (m) { sheetDate = m.text; break; }
    }
  }

  const flights: ParsedFlight[] = [];
  const warnings: ParseWarning[] = [];
  let rowIdx = 0;
  let rowIndex = 0;

  for (const row of merged) {
    const arrCs = row.items.find(it => it.x >= 18 && it.x <= 35);
    if (!arrCs) continue;
    if (new RegExp(`^(Vuelo|Origen|Avión|F\.Prev|Hora|LLEGADAS|SALIDAS|${FBO_HEADER}|Orden|Día|Page)`, 'i').test(arrCs.text)) continue;
    if (/^\d{2}\/\d{2}\/\d{2}/.test(arrCs.text)) continue;
    rowIdx++;

    rowIndex++;
    const logicalRow = rowIndex;

    const f: ParsedFlight = {
      callsign: '', origin: '', prevDate: '', arrTime: '',
      registration: '', aircraft: '', parking: '',
      crewArr: '', crewDep: '', paxArr: '', paxDep: '',
      depCallsign: '', destination: '', depDate: '', depTime: '',
      flightType: 'HANDLING',
    };

    // Track items that fall outside all known column ranges so we can warn
    // if meaningful text was discarded from what looks like a data row.
    const unmappedTexts: string[] = [];

    for (const it of row.items) {
      const col = findColumn(it.x);
      const txt = it.text.replace(/\*/g, '');
      switch (col) {
        case 'arr_callsign': f.callsign = txt; break;
        case 'origin':       f.origin = txt; break;
        case 'prev_date':    f.prevDate = txt; break;
        case 'arr_time':     f.arrTime = txt; break;
        case 'registration': f.registration = txt; break;
        case 'aircraft':     f.aircraft = txt; break;
        case 'parking':      f.parking = txt; break;
        case 'crew_arr':     f.crewArr = txt; break;
        case 'crew_dep':     f.crewDep = txt; break;
        case 'pax_arr':      f.paxArr = txt; break;
        case 'pax_dep':      f.paxDep = txt; break;
        case 'dep_callsign': f.depCallsign = txt; break;
        case 'destination':  f.destination = txt; break;
        case 'dep_date':     f.depDate = txt; break;
        case 'dep_time':     f.depTime = txt; break;
        case 'crew_sep':     break; // separator "/" — intentionally absorbed
        case 'pax_sep':      break; // separator "/" — intentionally absorbed
        case 'loc':          break; // localiser/stand code column — informational only
        default:
          // col === null: item x is outside every known column range.
          // Only flag non-trivial text (not pure punctuation / whitespace).
          if (txt.length > 0 && !/^[/\-\s]+$/.test(txt)) {
            unmappedTexts.push(`"${txt}"@x=${Math.round(it.x)}`);
          }
      }
    }

    f.flightType = detectFlightType(f.callsign, f.registration);

    // Registra filas con datos pero sin campos clave para feedback al usuario
    if (!f.registration && (f.callsign || f.depCallsign)) {
      errors.push(`Página ${pageNum}, fila ${rowIdx}: registración no detectada (callsign "${f.callsign || f.depCallsign}")`);
    } else if (!f.callsign && !f.depCallsign && f.registration) {
      errors.push(`Página ${pageNum}, fila ${rowIdx}: callsign no detectado (matrícula "${f.registration}")`);
    } else if (!f.arrTime && !f.depTime && f.registration) {
      errors.push(`Página ${pageNum}, fila ${rowIdx}: sin ETA ni ETD (matrícula "${f.registration}")`);
    }

    // Warn: key identifying fields are suspiciously absent for a row that
    // passed the callsign-anchor filter.
    if (!f.registration) {
      warnings.push({
        row: logicalRow,
        reason: `Fila ${logicalRow} (callsign=${f.callsign || '?'}): sin matrícula — la fila se incluye pero no se podrá cruzar con Extras`,
      });
    }

    // Warn: text items fell outside all column ranges (potential layout shift).
    if (unmappedTexts.length > 0) {
      warnings.push({
        row: logicalRow,
        reason: `Fila ${logicalRow} (callsign=${f.callsign || '?'}): ${unmappedTexts.length} item(s) fuera de columna — posible desplazamiento de layout: ${unmappedTexts.join(', ')}`,
      });
    }

    flights.push(f);
  }

  return { sheetDate, flights, errors, warnings };
}

export async function parseCybermaxPdf(buffer: Buffer | Uint8Array): Promise<ParseResult> {
  const data = new Uint8Array(buffer instanceof Buffer ? buffer : Buffer.from(buffer));
  const pdf = await pdfjsLib.getDocument({ data }).promise;

  const pageItems: PdfItem[][] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const tc = await page.getTextContent();
    type RawTextItem = { str: string; transform: number[] };
    const items: PdfItem[] = (tc.items as RawTextItem[])
      .filter((it) => it.str && it.str.trim())
      .map((it) => ({
        text: it.str.trim(),
        x: it.transform[4],
        y: it.transform[5],
        page: pageNum - 1,
      }));
    pageItems[pageNum - 1] = items;
  }

  let sheetDate = '';
  const allFlights: ParsedFlight[] = [];
  const allErrors: string[] = [];
  const allWarnings: ParseWarning[] = [];

  for (let i = 0; i < pageItems.length; i++) {
    const { sheetDate: sd, flights, errors, warnings } = parsePageItems(pageItems[i] || [], i === 0, i + 1);
    if (sd) sheetDate = sd;
    allFlights.push(...flights);
    allErrors.push(...errors);
    // Prefix each warning's reason with the page number for multi-page PDFs.
    for (const w of warnings) {
      allWarnings.push({ row: w.row, reason: `[p${i + 1}] ${w.reason}` });
    }
  }

  if (!sheetDate) {
    allErrors.push("No se detectó la fecha de la sheet en el PDF");
  }

  return { sheetDate, flights: allFlights, errors: allErrors, warnings: allWarnings };
}
