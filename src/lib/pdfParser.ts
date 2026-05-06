// Facade over the V2 (coordinate-based) Cybermax PDF parser.
//
// V2 is the only parser. The legacy text-based V1 was removed: after upgrading
// pdf-parse 1.x → 2.x the new getText() output broke V1's regex, and V1 was
// already losing ~30% of fields on the original Cybermax layout. Repairing it
// was not worth it.
//
// Set PDF_PARSER=safe-mode in the environment to pause imports cleanly without
// a redeploy: parseCybermaxPdf logs a warning and returns an empty result with
// the shape callers already expect. Real rollback path is `git revert`.

import "./pdfPolyfills";
import { parseCybermaxPdf as parseV2 } from "./pdfParserV2";

export interface ParsedFlight {
  callsign: string;
  origin: string;
  arrivalDate: string;
  eta: string;
  registration: string;
  aircraftType: string;
  parking: string;
  crewArrival: number;
  crewDeparture: number;
  paxArrival: number;
  paxDeparture: number;
  departureCallsign: string;
  destination: string;
  departureDate: string;
  etd: string;
}

export interface ParseResult {
  date: string;
  flights: ParsedFlight[];
  errors: string[];
}

function toInt(s: string): number {
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

export async function parseCybermaxPdf(buffer: Buffer): Promise<ParseResult> {
  if (process.env.PDF_PARSER === "safe-mode") {
    console.warn("[pdfParser] SAFE_MODE active — returning empty result. Imports are paused.");
    return { date: "", flights: [], errors: [] };
  }

  const v2 = await parseV2(buffer);
  const flights: ParsedFlight[] = v2.flights.map(f => ({
    callsign: f.callsign,
    origin: f.origin,
    arrivalDate: f.prevDate || v2.sheetDate,
    eta: f.arrTime,
    registration: f.registration,
    aircraftType: f.aircraft,
    parking: f.parking,
    crewArrival: toInt(f.crewArr),
    crewDeparture: toInt(f.crewDep),
    paxArrival: toInt(f.paxArr),
    paxDeparture: toInt(f.paxDep),
    departureCallsign: f.depCallsign,
    destination: f.destination,
    departureDate: f.depDate || v2.sheetDate,
    etd: f.depTime,
  }));

  return { date: v2.sheetDate, flights, errors: [] };
}

/** Convert a DD/MM/YY date string to a JS Date at midnight UTC */
export function parseDate(ddmmyy: string): Date {
  const [dd, mm, yy] = ddmmyy.split("/").map(Number);
  const year = yy < 50 ? 2000 + yy : 1900 + yy;
  return new Date(Date.UTC(year, mm - 1, dd, 0, 0, 0, 0));
}
