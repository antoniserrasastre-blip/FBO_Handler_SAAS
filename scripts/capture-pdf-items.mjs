/**
 * capture-pdf-items.mjs
 *
 * Temporary script to extract PdfItem[] arrays from real Cybermax PDFs for fixture generation.
 * Usage: node scripts/capture-pdf-items.mjs <path-to-pdf>
 *
 * Outputs JSON to stdout: { pages: PdfItem[][] }
 * Each PdfItem: { text, x, y, page }
 *
 * Same extraction logic as parseCybermaxPdf in pdfParserV2.ts.
 */

import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const require = createRequire(import.meta.url);
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf');
pdfjsLib.GlobalWorkerOptions.workerSrc = '';

const pdfPath = process.argv[2];
if (!pdfPath) {
  console.error('Usage: node scripts/capture-pdf-items.mjs <path-to-pdf>');
  process.exit(1);
}

const buffer = readFileSync(resolve(pdfPath));
const data = new Uint8Array(buffer);
const pdf = await pdfjsLib.getDocument({ data }).promise;

console.error(`PDF loaded: ${pdf.numPages} page(s) — ${pdfPath}`);

const pages = [];
for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
  const page = await pdf.getPage(pageNum);
  const tc = await page.getTextContent();
  const items = tc.items
    .filter(it => it.str && it.str.trim())
    .map(it => ({
      text: it.str.trim(),
      x: Math.round(it.transform[4] * 100) / 100,
      y: Math.round(it.transform[5] * 100) / 100,
      page: pageNum - 1,
    }));
  pages.push(items);
  console.error(`  Page ${pageNum}: ${items.length} items`);
}

// Write JSON only to a file (stdout gets polluted by pdfjs warnings)
import { writeFileSync } from 'fs';
const outPath = process.argv[3] || '/tmp/pdf-items-out.json';
writeFileSync(outPath, JSON.stringify({ pages }, null, 2));
console.error('Written to', outPath);
