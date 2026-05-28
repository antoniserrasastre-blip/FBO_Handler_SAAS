// Registry of aviation operators by ICAO callsign prefix
// Source: ICAO callsign data for general aviation operators

export interface Operator {
  icao: string;          // ICAO callsign prefix (e.g. "NJE")
  name: string;          // Full company name
  country: string;       // Country of AOC
  regPrefix: string;     // Typical registration prefix (e.g. "CS-")
  type: string;          // fractional | charter | management | private
  flights: number;       // Approximate flights in our data (apr 2026)
  notes?: string;        // Special handling notes
}

export const OPERATORS: Operator[] = [
  // === HIGH FREQUENCY (5+ flights) ===
  { icao: "NJE", name: "NetJets Europe", country: "Portugal", regPrefix: "CS-", type: "fractional", flights: 44 },
  { icao: "VJT", name: "VistaJet", country: "Malta", regPrefix: "9H-", type: "charter", flights: 19, notes: "Flota 9H- Malta, subsidiary VJH en Alemania" },
  { icao: "JFA", name: "Jetfly Aviation", country: "Luxemburgo", regPrefix: "LX-", type: "fractional", flights: 15 },
  { icao: "PTN", name: "Platoon Aviation", country: "Alemania", regPrefix: "D-", type: "charter", flights: 7, notes: "Flota PC-24, base Hamburg" },
  { icao: "FJO", name: "Flexjet Operations Malta", country: "Malta", regPrefix: "9H-", type: "fractional", flights: 7, notes: "UK branch FLJ (G-)" },
  { icao: "VJH", name: "VistaJet Germany", country: "Alemania", regPrefix: "D-", type: "charter", flights: 6, notes: "Subsidiaria de VistaJet" },
  { icao: "SCR", name: "Silver Cloud Air", country: "Alemania", regPrefix: "D-", type: "charter", flights: 5 },
  { icao: "ECA", name: "Excellent Air", country: "Alemania", regPrefix: "D-", type: "charter", flights: 5 },
  { icao: "LUA", name: "Luminair", country: "Alemania", regPrefix: "D-", type: "charter", flights: 5, notes: "Fundada 2024, ex-Air Hamburg" },

  // === MEDIUM FREQUENCY (2-4 flights) ===
  { icao: "SAH", name: "SmartJet", country: "Polonia", regPrefix: "SP-", type: "charter", flights: 4 },
  { icao: "AWH", name: "Aerowest", country: "Alemania", regPrefix: "D-", type: "charter", flights: 4, notes: "Tambien ambulancia/cargo" },
  { icao: "PVD", name: "PAD Aviation", country: "Alemania", regPrefix: "D-", type: "charter", flights: 4 },
  { icao: "SVW", name: "Global Jet Luxembourg", country: "Luxemburgo", regPrefix: "LX-", type: "charter", flights: 3 },
  { icao: "MMD", name: "Air Alsie", country: "Dinamarca", regPrefix: "OY-", type: "charter", flights: 3 },
  { icao: "DGJ", name: "DigaJet", country: "Alemania", regPrefix: "D-", type: "charter", flights: 3 },
  { icao: "HRN", name: "Heron Aviation", country: "Alemania", regPrefix: "D-", type: "charter", flights: 3 },
  { icao: "GES", name: "Gestair", country: "Espana", regPrefix: "EC-", type: "charter", flights: 3, notes: "Mayor flota bizav en Espana" },
  { icao: "GAC", name: "GlobeAir", country: "Austria", regPrefix: "OE-", type: "charter", flights: 3, notes: "Mayor operador Cessna Mustang del mundo" },
  { icao: "EFD", name: "Eisele Flugdienst / E-Aviation", country: "Alemania", regPrefix: "D-", type: "charter", flights: 3 },
  { icao: "BFX", name: "Fly Away", country: "Alemania", regPrefix: "D-", type: "charter", flights: 2 },
  { icao: "JFL", name: "Jetfly Airlines", country: "Austria", regPrefix: "OE-", type: "charter", flights: 2 },
  { icao: "SUA", name: "Silesia Air", country: "Chequia", regPrefix: "OK-", type: "charter", flights: 2 },
  { icao: "QGA", name: "Windrose Air", country: "Alemania", regPrefix: "D-", type: "charter", flights: 2 },
  { icao: "AZE", name: "Arcus-Air Logistic", country: "Alemania", regPrefix: "D-", type: "charter", flights: 2 },
  { icao: "TSW", name: "Transwing", country: "Suiza", regPrefix: "HB-", type: "charter", flights: 2 },
  { icao: "LJC", name: "The Little Jet Company", country: "UK", regPrefix: "G-", type: "charter", flights: 2 },
  { icao: "DWW", name: "DAS Private Jets", country: "Alemania", regPrefix: "D-", type: "charter", flights: 2 },
  { icao: "ELG", name: "Elangeni", country: "Austria", regPrefix: "OE-", type: "charter", flights: 2 },
  { icao: "SKV", name: "Skyside", country: "Austria", regPrefix: "OE-", type: "charter", flights: 2 },
  { icao: "PAV", name: "ProAir Aviation", country: "Alemania", regPrefix: "D-", type: "charter", flights: 2 },
  { icao: "JME", name: "EJME Aircraft Management", country: "Portugal", regPrefix: "CS-", type: "management", flights: 2 },
  { icao: "BVR", name: "ACM Air Charter", country: "Alemania", regPrefix: "D-", type: "charter", flights: 2 },
  { icao: "HEY", name: "ZondaJet", country: "Polonia", regPrefix: "SP-", type: "charter", flights: 2 },

  // === LOW FREQUENCY (1 flight) ===
  { icao: "BRO", name: "2Excel Aviation", country: "UK", regPrefix: "G-", type: "charter", flights: 1 },
  { icao: "EDC", name: "Air Charter Scotland", country: "UK", regPrefix: "G-", type: "charter", flights: 1 },
  { icao: "ADN", name: "Aero-Dienst", country: "Alemania", regPrefix: "D-", type: "charter", flights: 1 },
  { icao: "JDI", name: "Jet Story", country: "Polonia", regPrefix: "SP-", type: "charter", flights: 1 },
  { icao: "BOH", name: "Air Bohemia", country: "Chequia", regPrefix: "OK-", type: "charter", flights: 1 },
  { icao: "TIE", name: "Time Air", country: "Chequia", regPrefix: "OK-", type: "charter", flights: 1 },
  { icao: "DBT", name: "DB Aviation", country: "Portugal", regPrefix: "CS-", type: "charter", flights: 1 },
  { icao: "CAZ", name: "CAT Aviation", country: "Suiza", regPrefix: "HB-", type: "charter", flights: 1 },
  { icao: "AXY", name: "AirX Charter", country: "Malta", regPrefix: "9H-", type: "charter", flights: 1 },
  { icao: "MCK", name: "Aeroways", country: "Alemania", regPrefix: "D-", type: "charter", flights: 1 },
  { icao: "QQE", name: "Qatar Executive", country: "Qatar", regPrefix: "A7-", type: "charter", flights: 1, notes: "Subsidiaria Qatar Airways, ultra-premium" },
  { icao: "MOZ", name: "Salzburg Jet Aviation", country: "Austria", regPrefix: "OE-", type: "charter", flights: 1 },
  { icao: "RJB", name: "Panellenic Private Aviation", country: "Grecia", regPrefix: "SX-", type: "charter", flights: 1 },
  { icao: "AOJ", name: "Avcon Jet", country: "Austria", regPrefix: "OE-", type: "management", flights: 1, notes: "100+ aviones gestionados" },
  { icao: "JAR", name: "Airlink Austria", country: "Austria", regPrefix: "OE-", type: "charter", flights: 1 },
  { icao: "BNI", name: "Bartolini Air", country: "Polonia", regPrefix: "SP-", type: "charter", flights: 1 },
  { icao: "FSE", name: "Alpine Flightservice", country: "Austria", regPrefix: "OE-", type: "charter", flights: 1 },
  { icao: "GFM", name: "Grafair", country: "Suecia", regPrefix: "SE-", type: "charter", flights: 1 },
  { icao: "FLJ", name: "Flexjet UK", country: "UK", regPrefix: "G-", type: "fractional", flights: 1, notes: "Misma empresa que FJO (Malta)" },
  { icao: "SSR", name: "Sardinian Sky Service", country: "Italia", regPrefix: "I-", type: "charter", flights: 1 },
  { icao: "JCO", name: "Jet Concierge Club", country: "UK", regPrefix: "G-", type: "charter", flights: 1 },
  { icao: "ULC", name: "Albinati Aviation", country: "Malta", regPrefix: "9H-", type: "charter", flights: 1 },
];

// Lookup by ICAO prefix
const operatorByIcao = new Map(OPERATORS.map((op) => [op.icao, op]));

/**
 * Find operator by callsign (extracts letter prefix before digits)
 * e.g. "NJE592V" → "NJE" → NetJets Europe
 */
export function findOperator(callsign: string): Operator | null {
  const clean = callsign.replace(/[*\s]/g, "").toUpperCase();
  const match = clean.match(/^([A-Z]+)/);
  if (!match) return null;
  return operatorByIcao.get(match[1]) || null;
}

/**
 * Get operator name for display, with fallback to callsign prefix
 */
export function getOperatorName(callsign: string): string {
  const op = findOperator(callsign);
  if (op) return op.name;
  const match = callsign.replace(/[*\s]/g, "").match(/^([A-Z]+)/i);
  return match ? match[1] : "Privado";
}
