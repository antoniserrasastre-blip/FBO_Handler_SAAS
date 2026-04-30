/**
 * pdfParserV2 — Coordinate-based parser for Cybermax FBO PDFs
 *
 * Uses pdf-parse v2's internal pdfjs to access X,Y coordinates of each text item.
 * Groups items by Y (rows), assigns each item to a column by X position.
 *
 * Validated against 16 real Cybermax PDFs (April 2026): exact flight count match
 * vs manual verification on 4 sample days, 0 missing registrations, 0 missing
 * aircraft types. Replaces text-only parsing which had ~30% data loss.
 */

import "./pdfPolyfills";
import { PDFParse } from 'pdf-parse';

export type FlightType = 'HANDLING' | 'EXTERNAL_SERVICE' | 'LOUNGE_GUEST';

export interface ParsedFlight {
  callsign: string;
  origin: string;
  prevDate: string;     // arrival date if different from sheet date (DD/MM/YY)
  arrTime: string;      // HH:MM
  registration: string;
  aircraft: string;     // ICAO type code
  parking: string;      // can be number, alphanumeric (156B, HOSP, CW8) or empty
  crewArr: string;
  crewDep: string;
  paxArr: string;
  paxDep: string;
  depCallsign: string;
  destination: string;
  depDate: string;      // DD/MM/YY
  depTime: string;      // HH:MM
  flightType: FlightType;
}

export interface ParseResult {
  sheetDate: string;    // DD/MM/YY
  flights: ParsedFlight[];
}

// Column X-coordinate anchors in the Cybermax PDF layout (in PDF points).
// Tolerance is ±5pt on the left edge, plus column width on the right.
const COLUMNS = {
  arr_callsign: { x: 20,  width: 50 },
  origin:       { x: 71,  width: 40 },
  prev_date:    { x: 114, width: 40 },
  arr_time:     { x: 156, width: 25 },
  registration: { x: 185, width: 50 },
  aircraft:     { x: 236, width: 30 },
  loc:          { x: 270, width: 30 }, // LEPA — discarded
  parking:      { x: 303, width: 50 },
  crew_arr:     { x: 352, width: 8  },
  crew_sep:     { x: 362, width: 4  }, // "/" — discarded
  crew_dep:     { x: 368, width: 8  },
  pax_arr:      { x: 387, width: 6  },
  pax_sep:      { x: 395, width: 4  }, // "/" — discarded
  pax_dep:      { x: 399, width: 8  },
  dep_callsign: { x: 418, width: 45 },
  destination:  { x: 467, width: 40 },
  dep_date:     { x: 509, width: 40 },
  dep_time:     { x: 549, width: 30 },
} as const;

type ColumnName = keyof typeof COLUMNS;

function findColumn(x: number): ColumnName | null {
  for (const [name, { x: cx, width }] of Object.entries(COLUMNS) as [ColumnName, { x: number; width: number }][]) {
    if (x >= cx - 5 && x <= cx + width) return name;
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

interface PdfItem {
  text: string;
  x: number;
  y: number;
}

interface Row {
  y: number;
  items: PdfItem[];
}

/**
 * Parse a Cybermax FBO PDF buffer into structured flight data.
 *
 * @param buffer - The PDF file as a Buffer (Node) or Uint8Array (browser/edge).
 * @returns sheet date and array of parsed flights.
 */
export async function parseCybermaxPdf(buffer: Buffer | Uint8Array): Promise<ParseResult> {
  const parser = new PDFParse({ data: buffer });

  try {
    // pdf-parse v2 keeps `load`/`doc` private at the type level, but they are
    // accessible at runtime. We need raw pdfjs page access for X,Y coordinates,
    // which the public getText/getTable APIs do not expose.
    const internal = parser as unknown as {
      load: () => Promise<void>;
      doc: { getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: any[] }> }> };
    };
    await internal.load();
    const page = await internal.doc.getPage(1);
    const tc = await page.getTextContent();

    // Extract items with positions
    const items: PdfItem[] = tc.items
      .filter((it: any) => it.str && it.str.trim())
      .map((it: any) => ({
        text: it.str.trim(),
        x: it.transform[4],
        y: it.transform[5],
      }));

    // Group items by rounded Y coordinate (same row)
    const rowsByY = new Map<number, PdfItem[]>();
    for (const it of items) {
      const yKey = Math.round(it.y);
      if (!rowsByY.has(yKey)) rowsByY.set(yKey, []);
      rowsByY.get(yKey)!.push(it);
    }

    // Sort rows top→bottom (descending Y in PDF coords), items left→right
    const rows: Row[] = [...rowsByY.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([y, rowItems]) => ({
        y,
        items: rowItems.sort((a, b) => a.x - b.x),
      }));

    // Cybermax splits each flight across two adjacent Y rows (the dep_date and
    // dep_time fall on a slightly lower line than the rest of the flight data).
    // Merge rows whose Y differs by ≤1 point.
    const merged: Row[] = [];
    for (const row of rows) {
      const prev = merged[merged.length - 1];
      if (prev && Math.abs(prev.y - row.y) <= 1) {
        prev.items.push(...row.items);
      } else {
        merged.push({ y: row.y, items: [...row.items] });
      }
    }
    for (const row of merged) row.items.sort((a, b) => a.x - b.x);

    // Find the sheet date: a "DD/MM/YY" item near the top of the page
    let sheetDate = '';
    for (const row of merged) {
      if (row.y < 700) break;
      const m = row.items.find(it => /^\d{2}\/\d{2}\/\d{2}$/.test(it.text));
      if (m) { sheetDate = m.text; break; }
    }

    // Parse flights — each row that has an item near X≈20 is a flight row
    const flights: ParsedFlight[] = [];

    for (const row of merged) {
      const arrCs = row.items.find(it => it.x >= 18 && it.x <= 35);
      if (!arrCs) continue;

      // Skip page headers, column labels, sheet-date row, and footer timestamp
      if (/^(Vuelo|Origen|Avión|F\.Prev|Hora|LLEGADAS|SALIDAS|MALLORCAIR|Orden|Día|Page)/i.test(arrCs.text)) continue;
      // Footer is "DD/MM/YY HH:MM:SS" (single token) — also catches sheet date row
      if (/^\d{2}\/\d{2}\/\d{2}/.test(arrCs.text)) continue;

      const f: ParsedFlight = {
        callsign: '', origin: '', prevDate: '', arrTime: '',
        registration: '', aircraft: '', parking: '',
        crewArr: '', crewDep: '', paxArr: '', paxDep: '',
        depCallsign: '', destination: '', depDate: '', depTime: '',
        flightType: 'HANDLING',
      };

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
          // 'loc', 'crew_sep', 'pax_sep' intentionally ignored
        }
      }

      f.flightType = detectFlightType(f.callsign, f.registration);
      flights.push(f);
    }

    return { sheetDate, flights };
  } finally {
    await parser.destroy();
  }
}
