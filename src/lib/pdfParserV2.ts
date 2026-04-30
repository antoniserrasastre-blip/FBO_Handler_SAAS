/**
 * pdfParserV2 — Coordinate-based parser for Cybermax FBO PDFs
 *
 * Uses pdf-parse v1's pagerender hook to access X,Y coordinates of each text
 * item via the underlying pdfjs page.getTextContent() call.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse');

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

export interface ParseResult {
  sheetDate: string;
  flights: ParsedFlight[];
}

const COLUMNS = {
  arr_callsign: { x: 20,  width: 50 },
  origin:       { x: 71,  width: 40 },
  prev_date:    { x: 114, width: 40 },
  arr_time:     { x: 156, width: 25 },
  registration: { x: 185, width: 50 },
  aircraft:     { x: 236, width: 30 },
  loc:          { x: 270, width: 30 },
  parking:      { x: 303, width: 50 },
  crew_arr:     { x: 352, width: 5  },  // max x=357, "/" at x=359 queda fuera
  crew_sep:     { x: 362, width: 4  },
  crew_dep:     { x: 368, width: 8  },
  pax_arr:      { x: 387, width: 4  },  // max x=391, "/" at x=392 queda fuera
  pax_sep:      { x: 395, width: 3  },  // max x=398, pax_dep at x=399 queda fuera
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
  page: number;
}

function parsePageItems(items: PdfItem[], isFirstPage: boolean): { sheetDate: string; flights: ParsedFlight[] } {
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
  for (const row of merged) {
    const arrCs = row.items.find(it => it.x >= 18 && it.x <= 35);
    if (!arrCs) continue;
    if (/^(Vuelo|Origen|Avión|F\.Prev|Hora|LLEGADAS|SALIDAS|MALLORCAIR|Orden|Día|Page)/i.test(arrCs.text)) continue;
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
      }
    }

    f.flightType = detectFlightType(f.callsign, f.registration);
    flights.push(f);
  }

  return { sheetDate, flights };
}

export async function parseCybermaxPdf(buffer: Buffer | Uint8Array): Promise<ParseResult> {
  // Collect items per page using pdf-parse's pagerender hook
  const pageItems: PdfItem[][] = [];
  let pageIndex = 0;

  await pdfParse(Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer), {
    pagerender: (pageData: any) => {
      const currentPage = pageIndex++;
      return pageData
        .getTextContent({ normalizeWhitespace: false, disableCombineTextItems: true })
        .then((tc: any) => {
          const items: PdfItem[] = tc.items
            .filter((it: any) => it.str && it.str.trim())
            .map((it: any) => ({
              text: it.str.trim(),
              x: it.transform[4],
              y: it.transform[5],
              page: currentPage,
            }));
          pageItems[currentPage] = items;
          return '';
        });
    },
    version: 'v1.10.100',
  });

  let sheetDate = '';
  const allFlights: ParsedFlight[] = [];

  for (let i = 0; i < pageItems.length; i++) {
    const { sheetDate: sd, flights } = parsePageItems(pageItems[i] || [], i === 0);
    if (sd) sheetDate = sd;
    allFlights.push(...flights);
  }

  return { sheetDate, flights: allFlights };
}
