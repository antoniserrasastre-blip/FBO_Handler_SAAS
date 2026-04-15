// Parser for MALLORCAIR "Extras" Excel files.
//
// Format: Two columns of aircraft registrations + service descriptions.
//   Column A: registration (without dash, e.g., "CSPHF")
//   Column B: service description (e.g., "CATERING, PRENSA")
//   Column E: registration (second column)
//   Column F: service description (second column)
//
// Additional description lines may follow without a registration.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require("xlsx");

export interface ParsedService {
  type: string;       // CATERING | DISHES | COOLER_BAG | STORAGE_BAG | LAUNDRY | THERMOS | NEWSPAPERS | CUSTOM
  name: string;       // Display name / original description
  quantity?: number;   // e.g., 2 for "2x TERMOS"
}

export interface ParsedExtra {
  registration: string; // With dash inserted (e.g., "CS-PHF")
  rawDescriptions: string[];   // Original descriptions
  services: ParsedService[];   // Parsed and categorized services
}

export interface ExcelParseResult {
  date: string;
  extras: ParsedExtra[];
  errors: string[];
}

// Known registration prefix lengths (1 or 2 chars before the dash)
const TWO_CHAR_PREFIXES = new Set([
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

const ONE_CHAR_PREFIXES = new Set(["B", "C", "D", "F", "G", "I", "N", "Z"]);

/** Insert dash into a registration without one (e.g., "CSPHF" → "CS-PHF") */
function insertDash(reg: string): string {
  if (reg.includes("-")) return reg;
  const upper = reg.toUpperCase();

  // Try 2-char prefix first
  const prefix2 = upper.slice(0, 2);
  if (TWO_CHAR_PREFIXES.has(prefix2) && upper.length > 2) {
    return prefix2 + "-" + upper.slice(2);
  }

  // Try 1-char prefix (except N — US N-numbers don't use dashes)
  const prefix1 = upper[0];
  if (prefix1 === "N") return upper; // N1113R stays as N1113R
  if (ONE_CHAR_PREFIXES.has(prefix1) && upper.length > 1) {
    return prefix1 + "-" + upper.slice(1);
  }

  // Fallback: return as-is (might be a non-standard registration)
  return upper;
}

/** Check if a dashless string looks like an aircraft registration (known prefix) */
function looksLikeRegistration(val: string): boolean {
  const u = val.toUpperCase();
  // Check 2-char prefixes
  if (TWO_CHAR_PREFIXES.has(u.slice(0, 2))) return true;
  // Check 1-char prefixes (except N which is ambiguous without dash)
  if (ONE_CHAR_PREFIXES.has(u[0]) && u[0] !== "N") return true;
  // N-numbers: N followed by digits
  if (u[0] === "N" && /^\d/.test(u[1])) return true;
  return false;
}

function isRegistration(val: string): boolean {
  const v = val.trim();
  // Must start with a letter, be 4-7 alphanumeric chars, and not look like a time (4 digits)
  return /^[A-Z][A-Z0-9]{3,6}$/i.test(v) && !/^\d{4}$/.test(v);
}

export function parseExtrasExcel(buffer: Buffer): ExcelParseResult {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: (string | number | null)[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

  const errors: string[] = [];
  const extrasMap = new Map<string, string[]>();
  let date = "";

  // Extract date from header row
  for (const row of rows.slice(0, 2)) {
    for (const cell of row) {
      if (cell && typeof cell === "string") {
        const dateMatch = cell.match(/FECHA:\s*(.+)/i);
        if (dateMatch) date = dateMatch[1].trim();
      }
    }
  }

  // Find where special sections start (CATERING AIRE / NETJETS / PRENSA)
  let specialRowStart = rows.length;
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i] || [];
    const joined = row.map(c => c ?? "").join(" ");
    if (/CATERING AIRE:|CATERING NETJETS:|PRENSA MCR/i.test(joined)) {
      specialRowStart = i;
      break;
    }
  }

  // --- Main extras section (rows 2 to specialRowStart) ---
  let currentRegLeft: string | null = null;
  let currentRegRight: string | null = null;

  for (let i = 2; i < specialRowStart; i++) {
    const row = rows[i] || [];
    const colA = row[0] != null ? String(row[0]).trim() : "";
    const colB = row[1] != null ? String(row[1]).trim() : "";
    const colE = row[4] != null ? String(row[4]).trim() : "";
    const colF = row[5] != null ? String(row[5]).trim() : "";

    // Left column (A + B)
    if (colA && isRegistration(colA)) {
      currentRegLeft = insertDash(colA);
      if (colB) {
        if (!extrasMap.has(currentRegLeft)) extrasMap.set(currentRegLeft, []);
        extrasMap.get(currentRegLeft)!.push(colB);
      }
    } else if (colB && currentRegLeft) {
      extrasMap.get(currentRegLeft)!.push(colB);
    }

    // Right column (E + F)
    if (colE && isRegistration(colE)) {
      currentRegRight = insertDash(colE);
      if (colF) {
        if (!extrasMap.has(currentRegRight)) extrasMap.set(currentRegRight, []);
        extrasMap.get(currentRegRight)!.push(colF);
      }
    } else if (colF && currentRegRight) {
      extrasMap.get(currentRegRight)!.push(colF);
    }
  }

  // --- Special sections (CATERING AIRE, CATERING NETJETS, PRENSA) ---
  // Row+0 = section headers, Row+1 = sub-headers (but prensa data starts here!), Row+2+ = data
  if (specialRowStart < rows.length) {
    // Start from row+1 because prensa entries begin on the sub-header row
    for (let i = specialRowStart + 1; i < rows.length; i++) {
      const row = rows[i] || [];

      // CATERING AIRE: col A = time (digits), col B = registration
      const caireTime = row[0] != null ? String(row[0]).trim() : "";
      const caireReg = row[1] != null ? String(row[1]).trim() : "";
      // Skip sub-header row values like "HORA:", "REG:"
      if (caireTime && /^\d{3,4}$/.test(caireTime) && caireReg && isRegistration(caireReg)) {
        const reg = insertDash(caireReg);
        const timeStr = caireTime.padStart(4, "0");
        const desc = `CATERING Aire ${timeStr.slice(0, 2)}:${timeStr.slice(2)}`;
        if (!extrasMap.has(reg)) extrasMap.set(reg, []);
        extrasMap.get(reg)!.push(desc);
      }

      // CATERING NETJETS: col C = time, col D = reference, col E = registration/type
      const njeTime = row[2] != null ? String(row[2]).trim() : "";
      const njeRef = row[3] != null ? String(row[3]).trim() : "";
      const njeRegRaw = row[4] != null ? String(row[4]).trim() : "";
      if (njeRef && njeRegRaw && /\d/.test(njeRef)) {
        // Parse registration: "CSPHF / P" or "CSPHF/C" or just "CSPHF"
        const njeMatch = njeRegRaw.match(/^([A-Z0-9]+)\s*\/?\s*([PC])?$/i);
        if (njeMatch) {
          const reg = insertDash(njeMatch[1]);
          const njeType = njeMatch[2]?.toUpperCase() === "C" ? "Crew" : "Pax";
          const timeStr = njeTime.padStart(4, "0");
          const desc = `CATERING NJE ${njeType} ${timeStr.slice(0, 2)}:${timeStr.slice(2)} Ref#${njeRef}`;
          if (!extrasMap.has(reg)) extrasMap.set(reg, []);
          extrasMap.get(reg)!.push(desc);
        }
      } else if (njeTime && /SKYVALET/i.test(njeTime)) {
        // SkyValet catering — sometimes appears in the NJE time column
        // No specific registration to associate with
      }

      // PRENSA MCR & RELAY: col F = registration, col G = newspaper titles
      const prensaReg = row[5] != null ? String(row[5]).trim() : "";
      const prensaTitles = row[6] != null ? String(row[6]).trim() : "";
      if (prensaReg && isRegistration(prensaReg) && prensaTitles) {
        const reg = insertDash(prensaReg);
        const desc = `PRENSA: ${prensaTitles}`;
        if (!extrasMap.has(reg)) extrasMap.set(reg, []);
        extrasMap.get(reg)!.push(desc);
      }
    }
  }

  const extras: ParsedExtra[] = [];
  for (const [registration, rawDescs] of extrasMap) {
    const services = rawDescs.flatMap(desc => categorizeService(desc));
    extras.push({ registration, rawDescriptions: rawDescs, services });
  }

  return { date, extras, errors };
}

/** Map a raw description to one or more categorized services */
function categorizeService(desc: string): ParsedService[] {
  const upper = desc.toUpperCase().trim();

  if (upper.length < 2) return [];
  if (upper.startsWith("REG:")) return [];

  // Skip registrations without dashes that leak in as service descriptions
  // Only filter if it matches a known prefix pattern (e.g., CSPHF, 9HILY, DCCHH)
  if (/^[A-Z0-9]{4,7}$/.test(upper) && looksLikeRegistration(upper)) return [];

  // Try to split compound descriptions: "CATERING, PRENSA" or "VAJILLA / 2x TERMOS"
  const parts = desc.split(/[,\/]+/).map(p => p.trim()).filter(p => p.length > 1);
  if (parts.length > 1) {
    return parts.flatMap(part => categorizeService(part));
  }

  // Extract quantity prefix like "02 TERMOS" or "2x TERMOS"
  let quantity = 1;
  let cleaned = desc.trim();
  const qtyMatch = cleaned.match(/^(\d+)\s*[xX]?\s+(.+)/);
  if (qtyMatch) {
    quantity = parseInt(qtyMatch[1], 10) || 1;
    cleaned = qtyMatch[2];
  }

  const u = cleaned.toUpperCase();

  // Categorize by keywords
  if (/CATER|CATE\b|COMIDA/.test(u)) {
    return [{ type: "CATERING", name: cleaned, quantity }];
  }
  if (/VAJILLA|CUBIERTOS|TENEDORES/.test(u)) {
    return [{ type: "DISHES", name: cleaned, quantity }];
  }
  if (/BOLSA\s*(DE\s+)?NEVERA|NEVERA|CONGELADOR|HIELO|PLACA|CAJA.*NEVERA/.test(u)) {
    return [{ type: "COOLER_BAG", name: cleaned, quantity }];
  }
  if (/BOLSA\s*(DE\s+)?ALMAC[EÉ]N|ALMAC[EÉ]N|CESTA/.test(u)) {
    return [{ type: "STORAGE_BAG", name: cleaned, quantity }];
  }
  if (/LAUNDRY|LINEN|NORDICO|MANTA/.test(u)) {
    return [{ type: "LAUNDRY", name: cleaned, quantity }];
  }
  if (/TERMO|TERMOS|CAF[EÉ]|COFFEE/.test(u)) {
    return [{ type: "THERMOS", name: cleaned, quantity }];
  }
  if (/PRENS|PRESS|PERI[OÓ]DIC|REVIST|FINANCIAL\s*TIME|NY\s*TIME|MAIL\s*ON|^FT$|F\.A\.Z|^STR\b|^STD\b|LISTA|RELAY/.test(u)) {
    return [{ type: "NEWSPAPERS", name: cleaned, quantity }];
  }

  // Everything else is CUSTOM
  return [{ type: "CUSTOM", name: cleaned, quantity }];
}
