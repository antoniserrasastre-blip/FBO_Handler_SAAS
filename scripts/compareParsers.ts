/**
 * compareParsers.ts — Validate V2 against a directory of real PDFs.
 *
 * Usage:
 *   npx tsx scripts/compareParsers.ts <pdfs-dir>
 *
 * Originally a V1↔V2 diff. V1 has been removed (it returned 0 flights after
 * the pdf-parse 1→2 upgrade and was losing ~30% of fields anyway), so this
 * script now just runs V2 over every PDF in the directory and prints per-day
 * counts. Useful as a smoke test for regressions when modifying V2.
 *
 * Outputs ./parser-comparison.json with the full per-day breakdown. Exits 0
 * if every PDF produced at least one flight, 1 otherwise.
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCybermaxPdf } from '../src/lib/pdfParserV2';

interface DayResult {
  file: string;
  sheetDate: string;
  total: number;
  handling: number;
  external: number;
  lounge: number;
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
  let hasEmpty = false;

  for (const file of files) {
    const buffer = readFileSync(join(dir, file));
    const { sheetDate, flights } = await parseCybermaxPdf(buffer);

    const handling = flights.filter(f => f.flightType === 'HANDLING').length;
    const external = flights.filter(f => f.flightType === 'EXTERNAL_SERVICE').length;
    const lounge   = flights.filter(f => f.flightType === 'LOUNGE_GUEST').length;

    const dayResult: DayResult = {
      file,
      sheetDate,
      total: flights.length,
      handling,
      external,
      lounge,
    };
    results.push(dayResult);

    if (flights.length === 0) hasEmpty = true;

    console.log(
      `${sheetDate.padEnd(10)} ${file.padEnd(20)}  total:${String(flights.length).padStart(3)}  ` +
      `(H:${handling} E:${external} L:${lounge})`
    );
  }

  writeFileSync('./parser-comparison.json', JSON.stringify(results, null, 2));
  console.log('\n→ Full breakdown saved to parser-comparison.json');

  const total = results.reduce((s, r) => s + r.total, 0);
  console.log(`\nTotal flights across ${results.length} PDFs: ${total}`);

  if (hasEmpty) {
    console.log('\n❌ At least one PDF produced 0 flights. Investigate before shipping changes.');
    process.exit(1);
  } else {
    console.log('\n✅ V2 produced flights on every PDF.');
    process.exit(0);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
