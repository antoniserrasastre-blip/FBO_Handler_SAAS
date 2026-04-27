// Parser for the Cybermax "Orden del día" PDF format.
// Optimized for multipage and robust parsing using slash-anchors and line accumulation.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdf = require("pdf-parse");

import { getAllStands } from "./parkingStands";

// Pre-calculate a set of all valid parking IDs for fast lookup
const VALID_PARKINGS = new Set(getAllStands().map(s => s.id.toUpperCase()));

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
  "CL30", "CL35", "CL60", "CL64", "CL65",
  "CRJ1", "CRJ2", "CRJ7", "CRJ9",
  "E135", "E145", "E170", "E175", "E190", "E195", "E290", "E295",
  "E35L", "E50P", "E55P", "E545",
  "F2TH", "F900", "FA50", "FA7X", "FA8X",
  "G150", "G200", "G280", "GA5C", "GA6C", "GALX", "GL5T", "GL6T", "GL7T", "GLEX", "GLF4", "GLF5", "GLF6",
  "H25B", "H25C", "HA4T", "HDJT",
  "LJ35", "LJ40", "LJ45", "LJ55", "LJ60", "LJ75",
  "P180", "PA46", "PC12", "PC24",
  "PRM1", "J328",
  "SF50", "SR22", "SU95", "SW4",
  "TBM7", "TBM8", "TBM9",
]);

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
  const flightBlocks: { dataLine: string; dateLine: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isHeaderOrFooter(line)) continue;

    // Start accumulation if we find LEPA
    if (line.includes("LEPA")) {
      let combinedData = line;
      let dateLine = "";
      
      // Look ahead to see if the flight data continues (we need 2 slashes)
      let j = i + 1;
      let slashesFound = (combinedData.match(/\//g) || []).length;
      
      while (j < lines.length && slashesFound < 2 && j < i + 4) {
        const next = lines[j];
        if (isHeaderOrFooter(next) || next.includes("LEPA") || isDateLine(next)) break;
        combinedData += " " + next;
        slashesFound = (combinedData.match(/\//g) || []).length;
        j++;
      }

      // Now look for the separate date/time line
      for (let k = j; k < Math.min(j + 5, lines.length); k++) {
        const potentialDate = lines[k];
        if (isDateLine(potentialDate)) {
          dateLine = potentialDate;
          j = k + 1; // Advance the outer pointer
          break;
        }
        if (isHeaderOrFooter(potentialDate) || potentialDate.includes("LEPA")) break;
      }
      
      flightBlocks.push({ dataLine: combinedData, dateLine });
      i = j - 1; // Sync outer loop
    }
  }

  for (const block of flightBlocks) {
    try {
      const flight = parseFlightBlock(block.dataLine, block.dateLine, sheetDate);
      if (flight) flights.push(flight);
    } catch (e) {
      errors.push(`Error parsing flight: ${e}`);
    }
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
    /^\d{2}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}/.test(line) ||
    /^\d{2}\/\d{2}\/\d{2}\s+\(/.test(line)
  );
}

function isDateLine(line: string): boolean {
  // A date line has one or more DD/MM/YY HH:MM and nothing else
  const stripped = line.replace(/\d{2}\/\d{2}\/\d{2}\s*\d{2}:\d{2}/g, "").trim();
  return stripped === "" && (line.includes("/") && line.includes(":"));
}

function parseFlightBlock(dataLine: string, dateLine: string, sheetDate: string): ParsedFlight | null {
  // 1. Flexible split by "LEPA"
  const lepaMatch = dataLine.match(/(.*)LEPA(.*)/);
  if (!lepaMatch) return null;

  const leftSide = lepaMatch[1].trim();
  const rightSide = lepaMatch[2].trim();

  // 2. Left Side: [Callsign] [Origin] [InlineDate]? [InlineTime]? [Registration] [Type]
  const leftTokens = leftSide.split(/\s+/);
  if (leftTokens.length < 2) return null;

  const callsign = leftTokens[0];
  let aircraftType = "";
  let registration = "";
  let origin = "";
  let inlineArrDate = "";
  let inlineArrTime = "";

  // Identify type (looking for known aircraft types from the end)
  let typeIdx = -1;
  for (let i = leftTokens.length - 1; i >= 0; i--) {
    if (AIRCRAFT_TYPES.has(leftTokens[i])) {
      typeIdx = i;
      break;
    }
  }

  if (typeIdx !== -1) {
    aircraftType = leftTokens[typeIdx];
    registration = leftTokens[typeIdx - 1] || "";
    origin = leftTokens[1]; // simplified assumption
    // Check if there are date/time tokens between origin and registration
    if (typeIdx > 3) {
       // Typically: Callsign Origin Date Time Registration Type
       inlineArrDate = leftTokens[2];
       inlineArrTime = leftTokens[3];
    }
  } else {
    // Fallback
    aircraftType = leftTokens[leftTokens.length - 1];
    registration = leftTokens[leftTokens.length - 2] || "";
    origin = leftTokens[1];
  }

  // 3. Right Side: [Parking]? [CrewArr] / [CrewDep] [PaxArr] / [PaxDep] [DepCallsign] [Dest] [Date]? [Time]?
  const slashParts = rightSide.split(/\s*\/\s*/);
  if (slashParts.length < 3) return null;

  // Segment 1: [Parking]? [CrewArr]
  const seg1Tokens = slashParts[0].trim().split(/\s+/);
  const crewArrival = parseInt(seg1Tokens[seg1Tokens.length - 1], 10) || 0;
  const parking = seg1Tokens.length > 1 ? seg1Tokens.slice(0, -1).join(" ") : "";

  // Segment 2: [CrewDep] [PaxArr]
  const seg2Tokens = slashParts[1].trim().split(/\s+/);
  const crewDeparture = parseInt(seg2Tokens[0], 10) || 0;
  const paxArrival = parseInt(seg2Tokens[seg2Tokens.length - 1], 10) || 0;

  // Segment 3: [PaxDep] [DepartureCallsign] [Destination] [Date]? [Time]?
  const seg3Tokens = slashParts[2].trim().split(/\s+/);
  const paxDeparture = parseInt(seg3Tokens[0], 10) || 0;
  const departureCallsign = seg3Tokens[1] || "";
  const destination = seg3Tokens[2] || "";
  let inlineDepDate = "";
  let inlineDepTime = "";
  if (seg3Tokens.length >= 5) {
    inlineDepDate = seg3Tokens[3];
    inlineDepTime = seg3Tokens[4];
  }

  // 4. Time consolidation
  let arrDate = inlineArrDate;
  let arrTime = inlineArrTime;
  let depDate = inlineDepDate;
  let depTime = inlineDepTime;

  if (dateLine) {
    const matches = [...dateLine.matchAll(/(\d{2}\/\d{2}\/\d{2})\s*(\d{2}:\d{2})/g)];
    if (matches.length >= 2) {
      if (!arrTime) { arrDate = matches[0][1]; arrTime = matches[0][2]; }
      if (!depTime) { depDate = matches[1][1]; depTime = matches[1][2]; }
    } else if (matches.length === 1) {
      if (!arrTime) { arrDate = matches[0][1]; arrTime = matches[0][2]; }
      else if (!depTime) { depDate = matches[0][1]; depTime = matches[0][2]; }
    }
  }

  return {
    callsign,
    origin,
    arrivalDate: arrDate || sheetDate,
    eta: arrTime || "",
    registration,
    aircraftType,
    parking: parking || "",
    crewArrival,
    crewDeparture,
    paxArrival,
    paxDeparture,
    departureCallsign,
    destination,
    departureDate: depDate || sheetDate,
    etd: depTime || "",
  };
}

/** Convert a DD/MM/YY date string to a JS Date at midnight UTC */
export function parseDate(ddmmyy: string): Date {
  if (!ddmmyy || !ddmmyy.includes("/")) return new Date();
  const [dd, mm, yy] = ddmmyy.split("/").map(Number);
  const year = yy < 50 ? 2000 + yy : 1900 + yy;
  return new Date(Date.UTC(year, mm - 1, dd, 0, 0, 0, 0));
}
