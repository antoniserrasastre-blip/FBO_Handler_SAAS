// Facade over the V1 (text-based) and V2 (coordinate-based) Cybermax PDF parsers.
//
// V2 is the default. Set PDF_PARSER=v1 in the environment to fall back to V1
// without redeploying code. V2's output is adapted to V1's shape so callers
// (api/import/route, import/page) keep working unchanged.

import { parseCybermaxPdf as parseV1, parseDate } from "./pdfParserV1";
import type { ParsedFlight, ParseResult } from "./pdfParserV1";
import { parseCybermaxPdf as parseV2 } from "./pdfParserV2";

export type { ParsedFlight, ParseResult };
export { parseDate };

function toInt(s: string): number {
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

export async function parseCybermaxPdf(buffer: Buffer): Promise<ParseResult> {
  if (process.env.PDF_PARSER === "v1") {
    return parseV1(buffer);
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
