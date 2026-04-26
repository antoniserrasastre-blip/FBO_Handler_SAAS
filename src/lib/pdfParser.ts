// Parser for the Cybermax "Orden del día" PDF format.
//
// pdf-parse v1 extracts text with columns concatenated. The column order
// extracted per flight is:
//
//   callsign [arr_date arr_time]? registration parking pax_arr / crew_arr
//   crew_dep / dep_callsign [dep_date dep_time]? actype LEPA origin dest pax_dep
//
// Dates appear inline only when they differ from the day sheet date.
// Otherwise arr/dep date+time appear on a separate line below the flight.

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

// Known aircraft types that appear in these PDFs
const AIRCRAFT_TYPES = new Set([
  "A318", "A319", "A320", "A321", "A332", "A333", "A339", "A346",
  "B733", "B734", "B735", "B736", "B737", "B738", "B739", "B38M", "B39M",
  "B744", "B748", "B752", "B753", "B762", "B763", "B764", "B772", "B773", "B77L", "B77W", "B788", "B789",
  "BE20", "BE40", "BE9L", "BE36", "BE58",
  "C25A", "C25B", "C25C", "C25M", "C500", "C510", "C525", "C550", "C560", "C56X", "C650", "C680", "C68A", "C700", "C750",
  "CL30", "CL35", "CL60", "CL64", "CL65",
  "CRJ1", "CRJ2", "CRJ7", "CRJ9",
  "E135", "E145", "E170", "E175", "E190", "E195", "E290", "E295",
  "E35L", "E50P", "E55P", "E545",
  "F2TH", "F900", "FA50", "FA7X", "FA8X",
  "G150", "G200", "G280", "GA5C", "GA6C", "GALX", "GL5T", "GL7T", "GLEX", "GLF4", "GLF5", "GLF6",
  "H25B", "H25C", "HA4T", "HDJT",
  "LJ35", "LJ40", "LJ45", "LJ55", "LJ60", "LJ75",
  "P180", "PA46", "PC12", "PC24",
  "PRM1",
  "SF50", "SR22", "SU95", "SW4",
  "TBM7", "TBM8", "TBM9",
]);

const DATE_RE = /(\d{2})\/(\d{2})\/(\d{2})/;
const TIME_RE = /(\d{2}):(\d{2})/;
const DATE_TIME_RE = /(\d{2}\/\d{2}\/\d{2})(\d{2}:\d{2})/;

// Main regex for a flight data line. Uses LEPA as anchor.
// Groups:  1=callsign prefix  2=middle (registration..crew..)  3=after LEPA (origin+dest+pax_dep)
const FLIGHT_LINE_RE = /^([A-Z][A-Z0-9]{2,})(.+)LEPA([A-Z]{4,}.+)$/;

export async function parseCybermaxPdf(buffer: Buffer): Promise<ParseResult> {
  const data = await pdf(buffer);
  const text: string = data.text;

  const errors: string[] = [];
  const flights: ParsedFlight[] = [];

  // Extract the day sheet date
  let sheetDate = "";
  const dateMatch = text.match(/(?:Día|Dia)\s+(\d{2}\/\d{2}\/\d{2})/i);
  if (dateMatch) {
    sheetDate = dateMatch[1];
  }

  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // Classify lines into flight data lines and date lines
  const flightBlocks: { dataLine: string; dateLine: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip headers and footers
    if (isHeaderOrFooter(line)) continue;

    // Check if this is a flight data line (contains LEPA)
    if (line.includes("LEPA") && FLIGHT_LINE_RE.test(line)) {
      // Look ahead for a date line
      let dateLine = "";
      if (i + 1 < lines.length && isDateLine(lines[i + 1])) {
        dateLine = lines[i + 1];
        i++; // Skip the date line
      }
      flightBlocks.push({ dataLine: line, dateLine });
    }
  }

  // Parse each flight block
  for (const block of flightBlocks) {
    try {
      const flight = parseFlightBlock(block.dataLine, block.dateLine, sheetDate);
      if (flight) flights.push(flight);
    } catch (e) {
      errors.push(`Error parsing line: ${block.dataLine.slice(0, 60)}... — ${e}`);
    }
  }

  if (flights.length === 0 && errors.length === 0) {
    errors.push("No se encontraron vuelos en el PDF");
  }

  return { date: sheetDate, flights, errors };
}

function isHeaderOrFooter(line: string): boolean {
  return (
    line.startsWith("LLEGADAS") ||
    line.startsWith("SALIDAS") ||
    line.startsWith("Orden del") ||
    line.startsWith("MALLORCAIR") ||
    line.startsWith("Vuelo") ||
    line.includes("Page ") ||
    line.includes("Avión") ||
    line.includes("F.Prev.") ||
    line.includes("Matrícula") ||
    /^\d{2}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}/.test(line) || // timestamp footer
    /^\d{2}\/\d{2}\/\d{2}\s+\(/.test(line) // date subheader like "14/04/26 (martes..."
  );
}

function isDateLine(line: string): boolean {
  // A date line contains 1 or 2 date-time pairs and nothing else
  const stripped = line.replace(/\d{2}\/\d{2}\/\d{2}\d{2}:\d{2}/g, "").trim();
  return stripped === "" && DATE_TIME_RE.test(line);
}

function parseFlightBlock(
  dataLine: string,
  dateLine: string,
  sheetDate: string
): ParsedFlight | null {
  const flightMatch = FLIGHT_LINE_RE.exec(dataLine);
  if (!flightMatch) return null;

  const leftSide = flightMatch[1] + flightMatch[2]; // Everything before LEPA
  const suffix = flightMatch[3]; // After LEPA: origin + dest + pax_dep

  // Parse suffix: origin (4 chars) + destination (4 chars) + pax_dep (digits)
  const suffixMatch = suffix.match(/^([A-Z]{4})([A-Z]{4})(\d+)$/);
  if (!suffixMatch) return null;
  const origin = suffixMatch[1];
  const destination = suffixMatch[2];
  const paxDeparture = parseInt(suffixMatch[3], 10);

  // --- Parse the left side ---
  // Strategy: use the dash in the registration as the anchor to split callsign from registration.
  // Registration format: 1-2 alphanumeric + dash + 2-4 alphanumeric (e.g., G-IASM, 9H-ILY, CS-LTD)

  const dashIdx = leftSide.indexOf("-");
  if (dashIdx < 0) return null;

  // Try registration prefix lengths: 2 chars before dash, then 1 char.
  // Validate the callsign part to pick the correct split.
  let callsignAndDate = "";
  let registration = "";
  let afterReg = "";

  // Known aircraft registration country prefixes (before the dash)
  const VALID_REG_PREFIXES = new Set([
    // 1-char
    "B", "C", "D", "F", "G", "I", "N", "Z",
    // 2-char
    "4X", "5A", "5B", "5N", "5T", "5Y", "7T", "8Q", "9A", "9G", "9H", "9K", "9L", "9M", "9N", "9V", "9Y",
    "A2", "A4", "A5", "A6", "A7", "A9", "AP",
    "CC", "CN", "CP", "CS", "CU", "CX",
    "D2", "D4", "D6", "DQ",
    "EC", "EI", "EK", "EP", "ER", "ES", "ET", "EW", "EX", "EZ",
    "HA", "HB", "HC", "HH", "HI", "HK", "HL", "HP", "HR", "HS", "HZ",
    "JA", "JU", "JY",
    "LN", "LQ", "LV", "LX", "LY", "LZ",
    "OB", "OD", "OE", "OH", "OK", "OM", "OO", "OY",
    "P2", "P4", "PH", "PJ", "PK", "PP", "PR", "PT", "PZ",
    "RA", "RP",
    "SE", "SP", "ST", "SU", "SX",
    "TC", "TF", "TG", "TI", "TJ", "TN", "TR", "TS", "TT", "TU", "TY", "TZ",
    "UK", "UN", "UP", "UR",
    "V2", "V3", "V5", "V7", "V8", "VH", "VN", "VP", "VQ", "VR", "VT",
    "XA", "XB", "XC", "XT", "XU", "XY",
    "YA", "YI", "YJ", "YK", "YL", "YN", "YR", "YS", "YU", "YV",
    "ZA", "ZK", "ZP", "ZS",
  ]);

  const CALLSIGN_DATE_RE = /^[A-Z][A-Z0-9]+(\d{2}\/\d{2}\/\d{2}\d{2}:\d{2})?$/;

  for (const prefixLen of [2, 1]) {
    const regStart = dashIdx - prefixLen;
    if (regStart < 3) continue;

    const regAndRest = leftSide.slice(regStart);
    const regMatch = regAndRest.match(/^([A-Z0-9]{1,2}-[A-Z]{2,4})(\d.*)$/);
    if (regMatch) {
      const regPrefix = regMatch[1].split("-")[0];
      if (!VALID_REG_PREFIXES.has(regPrefix)) continue;

      const candidateCallsign = leftSide.slice(0, regStart);
      if (CALLSIGN_DATE_RE.test(candidateCallsign)) {
        callsignAndDate = candidateCallsign;
        registration = regMatch[1];
        afterReg = regMatch[2];
        break;
      }
    }
  }

  if (!registration) return null;

  // Parse callsign + optional inline arrival date/time
  let callsign = "";
  let inlineArrDate = "";
  let inlineArrTime = "";

  const cdMatch = callsignAndDate.match(
    /^([A-Z][A-Z0-9]+?)(\d{2}\/\d{2}\/\d{2})(\d{2}:\d{2})$/
  );
  if (cdMatch) {
    callsign = cdMatch[1];
    inlineArrDate = cdMatch[2];
    inlineArrTime = cdMatch[3];
  } else {
    callsign = callsignAndDate;
  }

  // afterReg format: "{parking}{pax_arr} / {crew_arr}{crew_dep} / {dep_callsign}{...}{actype}"
  // Use " / " as separators to split cleanly.
  const slashParts = afterReg.split(/\s*\/\s*/);
  if (slashParts.length < 3) return null;

  const parkingPax = slashParts[0]; // e.g. "2050" = parking "205" + pax "0"
  const crewStr = slashParts[1]; // e.g. "22" = crew_arr "2" + crew_dep "2"
  let rest = slashParts.slice(2).join("/"); // remainder after second "/"

  // Split parking from pax_arr: if parking ends with a letter (e.g., "156B0"),
  // the letter marks end of parking. Otherwise, last 1-3 digits are pax_arr.
  let parking = "";
  let paxArrival = 0;
  const letterParkingMatch = parkingPax.match(/^(\d+[A-Z])(\d+)$/);
  if (letterParkingMatch) {
    parking = letterParkingMatch[1];
    paxArrival = parseInt(letterParkingMatch[2], 10);
  } else {
    // All digits: parking is typically 2-4 digits, pax_arr is last 1-3 digits.
    // Heuristic: try splitting so parking is 2-4 chars. Start with pax being last 1 digit.
    parking = parkingPax.slice(0, -1);
    paxArrival = parseInt(parkingPax.slice(-1), 10);
  }

  // Split crew_arr and crew_dep: each is typically 1 digit (crew 1-9)
  // For 2-digit crew counts, split in half
  let crewArrival = 0;
  let crewDeparture = 0;
  if (crewStr.length === 2) {
    crewArrival = parseInt(crewStr[0], 10);
    crewDeparture = parseInt(crewStr[1], 10);
  } else if (crewStr.length === 4) {
    crewArrival = parseInt(crewStr.slice(0, 2), 10);
    crewDeparture = parseInt(crewStr.slice(2), 10);
  } else if (crewStr.length > 0) {
    const half = Math.floor(crewStr.length / 2);
    crewArrival = parseInt(crewStr.slice(0, half), 10);
    crewDeparture = parseInt(crewStr.slice(half), 10);
  }

  // rest = dep_callsign [dep_date dep_time]? actype
  // Find aircraft type from the end
  let aircraftType = "";
  for (let len = 4; len >= 3; len--) {
    const candidate = rest.slice(-len);
    if (AIRCRAFT_TYPES.has(candidate)) {
      aircraftType = candidate;
      rest = rest.slice(0, -len);
      break;
    }
  }
  if (!aircraftType) {
    // Fallback: last 4 alphanumeric chars
    const typeMatch = rest.match(/([A-Z][A-Z0-9]{2,3})$/);
    if (typeMatch) {
      aircraftType = typeMatch[1];
      rest = rest.slice(0, -typeMatch[1].length);
    }
  }

  // rest = dep_callsign [dep_date dep_time]?
  let departureCallsign = "";
  let inlineDepDate = "";
  let inlineDepTime = "";

  const depDateMatch = rest.match(
    /^([A-Z][A-Z0-9*]+?)(\d{2}\/\d{2}\/\d{2})(\d{2}:\d{2})$/
  );
  if (depDateMatch) {
    departureCallsign = depDateMatch[1].replace(/\*$/, "");
    inlineDepDate = depDateMatch[2];
    inlineDepTime = depDateMatch[3];
  } else {
    departureCallsign = rest.replace(/\*$/, "");
  }

  // Parse the date line for any missing dates/times
  let arrDate = inlineArrDate;
  let arrTime = inlineArrTime;
  let depDate = inlineDepDate;
  let depTime = inlineDepTime;

  if (dateLine) {
    const dateTimes = [...dateLine.matchAll(/(\d{2}\/\d{2}\/\d{2})(\d{2}:\d{2})/g)];

    if (dateTimes.length === 2) {
      if (!arrDate) { arrDate = dateTimes[0][1]; arrTime = dateTimes[0][2]; }
      if (!depDate) { depDate = dateTimes[1][1]; depTime = dateTimes[1][2]; }
    } else if (dateTimes.length === 1) {
      if (!arrDate && !arrTime) {
        arrDate = dateTimes[0][1];
        arrTime = dateTimes[0][2];
      } else if (!depDate && !depTime) {
        depDate = dateTimes[0][1];
        depTime = dateTimes[0][2];
      }
    }
  }

  if (!arrDate) arrDate = sheetDate;
  if (!depDate) depDate = sheetDate;

  return {
    callsign,
    origin,
    arrivalDate: arrDate,
    eta: arrTime,
    registration,
    aircraftType,
    parking,
    crewArrival,
    crewDeparture,
    paxArrival,
    paxDeparture,
    departureCallsign,
    destination,
    departureDate: depDate,
    etd: depTime,
  };
}

/** Convert a DD/MM/YY date string to a JS Date at midnight UTC */
export function parseDate(ddmmyy: string): Date {
  const [dd, mm, yy] = ddmmyy.split("/").map(Number);
  const year = yy < 50 ? 2000 + yy : 1900 + yy;
  // Create the date in UTC to avoid local timezone offsets
  return new Date(Date.UTC(year, mm - 1, dd, 0, 0, 0, 0));
}
