// Parser for the Cybermax "Orden del día" PDF format.
// Reverted to stable regex-based detection with surgical fix for multi-digit Pax/Crew.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdf = require("pdf-parse");

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

const AIRCRAFT_TYPES = new Set([
  "A318", "A319", "A320", "A321", "A332", "A333", "A339", "A346",
  "B733", "B734", "B735", "B736", "B737", "B738", "B739", "B38M", "B39M",
  "B744", "B748", "B752", "B753", "B762", "B763", "B764", "B772", "B773", "B77L", "B77W", "B788", "B789",
  "BE20", "BE40", "BE9L", "BE36", "BE58",
  "C25A", "C25B", "C25C", "C25M", "C500", "C510", "C525", "C550", "C560", "C56X", "C650", "C680", "C68A", "C700", "C750",
  "CJ1", "CJ2", "CJ3", "CJ4", "CL30", "CL35", "CL60", "CL64", "CL65",
  "CRJ1", "CRJ2", "CRJ7", "CRJ9", "E135", "E145", "E170", "E175", "E190", "E195", "E290", "E295",
  "E35L", "E50P", "E55P", "E545", "F2TH", "F900", "FA50", "FA7X", "FA8X",
  "G150", "G200", "G280", "GA5C", "GA6C", "GALX", "GL5T", "GL6T", "GL7T", "GLEX", "GLF3", "GLF4", "GLF5", "GLF6",
  "H25B", "H25C", "HA4T", "HDJT", "LJ35", "LJ40", "LJ45", "LJ55", "LJ60", "LJ75",
  "P180", "PA46", "PC12", "PC24", "PRM1", "J328", "SF50", "SR22", "SU95", "SW4", "TBM7", "TBM8", "TBM9",
]);

const DATE_TIME_RE = /(\d{2}\/\d{2}\/\d{2})\s*(\d{2}:\d{2})/;

export async function parseCybermaxPdf(buffer: Buffer): Promise<ParseResult> {
  const data = await pdf(buffer);
  const text: string = data.text;

  const errors: string[] = [];
  const flights: ParsedFlight[] = [];

  let sheetDate = "";
  const dateMatch = text.match(/(?:Día|Dia)\s+(\d{2}\/\d{2}\/\d{2})/i);
  if (dateMatch) sheetDate = dateMatch[1];

  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isHeaderOrFooter(line)) continue;

    // Stable anchor: " LEPA "
    if (line.includes(" LEPA ")) {
      // Look for optional date line below
      let dateLine = "";
      if (i + 1 < lines.length && isDateLine(lines[i + 1])) {
        dateLine = lines[i + 1];
        i++;
      }
      try {
        const flight = parseFlightLine(line, dateLine, sheetDate);
        if (flight) flights.push(flight);
      } catch (e) {
        errors.push(`Error: ${e}`);
      }
    }
  }

  return { date: sheetDate, flights, errors };
}

function isHeaderOrFooter(line: string): boolean {
  return line.startsWith("LLEGADAS") || line.startsWith("SALIDAS") || line.startsWith("Orden del") || 
         line.startsWith("MALLORCAIR") || line.includes("Page ") || line.includes("Matrícula");
}

function isDateLine(line: string): boolean {
  const stripped = line.replace(/\d{2}\/\d{2}\/\d{2}\s*\d{2}:\d{2}/g, "").trim();
  return stripped === "" && line.includes("/");
}

function parseFlightLine(line: string, dateLine: string, sheetDate: string): ParsedFlight | null {
  const parts = line.split(" LEPA ");
  if (parts.length < 2) return null;

  const left = parts[0].trim();
  const right = parts[1].trim();

  // Parse left: Callsign [Origin] [Date] [Time] Registration Type
  const leftTokens = left.split(/\s+/);
  const callsign = leftTokens[0];
  
  // Find type from the end
  let type = "";
  let reg = "";
  let origin = "";
  let inlineArrTime = "";
  let inlineArrDate = "";

  for (let i = leftTokens.length - 1; i >= 0; i--) {
    if (AIRCRAFT_TYPES.has(leftTokens[i])) {
      type = leftTokens[i];
      reg = leftTokens[i - 1] || "";
      origin = leftTokens[1] || "";
      // If we have date/time tokens
      if (i > 3) {
        inlineArrDate = leftTokens[i-3];
        inlineArrTime = leftTokens[i-2];
      }
      break;
    }
  }

  // Parse right: [Parking] CrewArr / CrewDep PaxArr / PaxDep [DepCallsign] [Dest] [Date] [Time]
  // The slashes after LEPA are reliable column separators
  const rightSlashes = right.split(/\s*\/\s*/);
  if (rightSlashes.length < 3) return null;

  // Segment 1: [Parking] CrewArr
  const seg1 = rightSlashes[0].trim().split(/\s+/);
  const crewArrival = parseInt(seg1[seg1.length - 1], 10) || 0;
  const parking = seg1.length > 1 ? seg1.slice(0, -1).join(" ") : "";

  // Segment 2: CrewDep PaxArr
  const seg2 = rightSlashes[1].trim().split(/\s+/);
  const crewDeparture = parseInt(seg2[0], 10) || 0;
  const paxArrival = parseInt(seg2[seg2.length - 1], 10) || 0;

  // Segment 3: PaxDep [DepCallsign] [Dest]
  const seg3 = rightSlashes[2].trim().split(/\s+/);
  const paxDeparture = parseInt(seg3[0], 10) || 0;
  const departureCallsign = seg3[1] || "";
  const destination = seg3[2] || "";

  // Date line parsing
  let arrDate = inlineArrDate, arrTime = inlineArrTime;
  let depDate = "", depTime = "";

  if (dateLine) {
    const matches = [...dateLine.matchAll(/(\d{2}\/\d{2}\/\d{2})\s*(\d{2}:\d{2})/g)];
    if (matches.length >= 2) {
      arrDate = matches[0][1]; arrTime = matches[0][2];
      depDate = matches[1][1]; depTime = matches[1][2];
    } else if (matches.length === 1) {
      if (!arrTime) { arrDate = matches[0][1]; arrTime = matches[0][2]; }
      else { depDate = matches[0][1]; depTime = matches[0][2]; }
    }
  }

  return {
    callsign, origin, registration: reg, aircraftType: type, parking,
    crewArrival, crewDeparture, paxArrival, paxDeparture,
    arrivalDate: arrDate || sheetDate, eta: arrTime || "",
    departureCallsign, destination, departureDate: depDate || sheetDate, etd: depTime || ""
  };
}

export function parseDate(ddmmyy: string): Date {
  if (!ddmmyy || !ddmmyy.includes("/")) return new Date();
  const [dd, mm, yy] = ddmmyy.split("/").map(Number);
  const year = yy < 50 ? 2000 + yy : 1900 + yy;
  return new Date(Date.UTC(year, mm - 1, dd, 0, 0, 0, 0));
}
