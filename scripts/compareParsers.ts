/**
 * compareParsers.ts — Compare V1 (production) and V2 (new) parsers
 *
 * Usage:
 *   npx tsx scripts/compareParsers.ts <pdfs-dir>
 *
 * Outputs a JSON diff to ./parser-comparison.json and a human-readable
 * summary to stdout. Exits with code 0 if the diff is acceptable, 1 if there
 * are unexpected losses (V2 has fewer flights than V1 on any given day).
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCybermaxPdf } from '../src/lib/pdfParserV2';
// Import the existing V1 parser. After the facade refactor, V1 lives in
// pdfParserV1.ts (the facade at pdfParser.ts dispatches V1/V2 by env var).
import * as v1 from '../src/lib/pdfParserV1';

interface DayResult {
  file: string;
  sheetDate: string;
  v1Count: number;
  v2Count: number;
  v2Handling: number;
  v2External: number;
  v2Lounge: number;
  diff: number;        // v2Count - v1Count
  v2OnlyCallsigns: string[];
  v1OnlyCallsigns: string[];
}

function getV1Flights(buffer: Buffer): any[] {
  // Try common export names. Adjust this if the V1 parser has a different shape.
  const fn =
    (v1 as any).parsePdf ??
    (v1 as any).parsePDF ??
    (v1 as any).parseCybermaxPdf ??
    (v1 as any).default;
  if (typeof fn !== 'function') {
    throw new Error('Could not find V1 parser entrypoint. Edit compareParsers.ts to import the correct function name.');
  }
  const result = fn(buffer);
  // V1 may return a Promise or a sync result, and may wrap flights in an object
  return Array.isArray(result) ? result : (result?.flights ?? []);
}

async function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: npx tsx scripts/compareParsers.ts <pdfs-dir>');
    process.exit(1);
  }

  const files = readdirSync(dir).filter(f => /\.pdf$/i.test(f)).sort();
  if (files.length === 0) {
    console.error(`No PDFs found in ${dir}`);
    process.exit(1);
  }

  const results: DayResult[] = [];
  let hasLoss = false;

  for (const file of files) {
    const buffer = readFileSync(join(dir, file));

    let v1Flights: any[] = [];
    try {
      v1Flights = await Promise.resolve(getV1Flights(buffer));
    } catch (e: any) {
      console.error(`V1 failed on ${file}: ${e.message}`);
    }

    const { sheetDate, flights: v2Flights } = await parseCybermaxPdf(buffer);

    // Build callsign sets for diff. Use callsign+registration as key to
    // disambiguate same-callsign repeats.
    const keyOf = (f: any) =>
      `${(f.callsign ?? f.flightNumber ?? '').toUpperCase()}__${(f.registration ?? f.tailNumber ?? '').toUpperCase()}`;

    const v1Keys = new Set(v1Flights.map(keyOf));
    const v2Keys = new Set(v2Flights.map(keyOf));

    const v2Only = [...v2Keys].filter(k => !v1Keys.has(k));
    const v1Only = [...v1Keys].filter(k => !v2Keys.has(k));

    const handling = v2Flights.filter(f => f.flightType === 'HANDLING').length;
    const external = v2Flights.filter(f => f.flightType === 'EXTERNAL_SERVICE').length;
    const lounge   = v2Flights.filter(f => f.flightType === 'LOUNGE_GUEST').length;

    const dayResult: DayResult = {
      file,
      sheetDate,
      v1Count: v1Flights.length,
      v2Count: v2Flights.length,
      v2Handling: handling,
      v2External: external,
      v2Lounge: lounge,
      diff: v2Flights.length - v1Flights.length,
      v2OnlyCallsigns: v2Only,
      v1OnlyCallsigns: v1Only,
    };
    results.push(dayResult);

    if (v1Only.length > 0) hasLoss = true;

    console.log(
      `${sheetDate.padEnd(10)} ${file.padEnd(20)}  V1:${String(v1Flights.length).padStart(3)}  ` +
      `V2:${String(v2Flights.length).padStart(3)} (H:${handling} E:${external} L:${lounge})  ` +
      `diff:${dayResult.diff >= 0 ? '+' : ''}${dayResult.diff}  ` +
      `v2-only:${v2Only.length}  v1-only:${v1Only.length}`
    );

    if (v1Only.length > 0) {
      console.log(`   ⚠️  V1 had but V2 lost: ${v1Only.join(', ')}`);
    }
    if (v2Only.length > 0 && v2Only.length <= 5) {
      console.log(`   ✓  V2 found new (likely fixes): ${v2Only.join(', ')}`);
    }
  }

  writeFileSync('./parser-comparison.json', JSON.stringify(results, null, 2));
  console.log('\n→ Full diff saved to parser-comparison.json');

  // Summary
  const totalV1 = results.reduce((s, r) => s + r.v1Count, 0);
  const totalV2 = results.reduce((s, r) => s + r.v2Count, 0);
  console.log(`\nTotal: V1=${totalV1}  V2=${totalV2}  delta=${totalV2 - totalV1}`);

  if (hasLoss) {
    console.log('\n❌ V2 lost flights that V1 had on at least one day. Review parser-comparison.json before merging.');
    process.exit(1);
  } else {
    console.log('\n✅ V2 ≥ V1 on every day. V2 is safe to use.');
    process.exit(0);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
