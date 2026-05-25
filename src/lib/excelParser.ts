// Parser for MALLORCAIR "Extras" Excel files.
//
// Layout:
//   Header row 0: "EXTRAS MALLORCAIR" + "FECHA: 13APR"
//   Row 1: "VUELO:" headers
//   Main section (row 2 to special sections):
//     Left column:  colA = registration, colB = description
//     Right column: colE = registration, colF = description
//     Continuation lines: colB/colF without a new reg in colA/colE
//   Special sections (after "CATERING AIRE:" row):
//     Catering Aire:  colA = time, colB = registration
//     Catering NJE:   colC = time, colD = reference, colE = reg + /P or /C
//     Prensa MCR:     colF = registration, colG = newspaper titles

// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require("xlsx");

export interface ParsedService {
  type: string;          // CATERING | DISHES | COOLER_BAG | STORAGE_BAG | LAUNDRY | THERMOS | NEWSPAPERS | CUSTOM
  name: string;          // Display name / original description
  quantity?: number;
  reference?: string;    // NJE reference number
  target?: string;       // PAX | CREW (for NJE caterings)
  origin?: string;       // NetJets | Catering Aire | MCR
}

export interface ParsedExtra {
  registration: string;
  rawDescriptions: string[];
  services: ParsedService[];
  date?: string;
}

export interface ExcelParseResult {
  date: string;
  extras: ParsedExtra[];
  errors: string[];
}

// Known 2-char registration prefixes
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
  "T7",
  "TC", "TF", "TG", "TI", "TJ", "TN", "TR", "TS", "TT", "TU", "TY", "TZ",
  "UK", "UN", "UP", "UR",
  "V2", "V3", "V5", "V7", "V8", "VH", "VN", "VP", "VQ", "VR", "VT",
  "XA", "XB", "XC", "XT", "XU", "XY",
  "YA", "YI", "YJ", "YK", "YL", "YN", "YR", "YS", "YU", "YV",
  "ZA", "ZK", "ZP", "ZS",
]);

const ONE_CHAR_PREFIXES = new Set(["B", "C", "D", "F", "G", "I", "N", "Z"]);

// Words that look like registrations but aren't
const FALSE_POSITIVES = new Set([
  "BARCELO", "FECHA", "VUELO", "EXTRAS", "CATERING", "PRENSA", "RELAY",
  "HORA", "LISTA", "SKYVALET", "MUCHAS", "MALETAS", "PERRO", "GATOS",
  "GAS", "PAX", "CREW", "STAFF", "NOTAS", "FICHA",
]);

function insertDash(reg: string): string {
  if (reg.includes("-")) return reg;
  const upper = reg.toUpperCase();
  const prefix2 = upper.slice(0, 2);
  if (TWO_CHAR_PREFIXES.has(prefix2) && upper.length > 2) return prefix2 + "-" + upper.slice(2);
  const prefix1 = upper[0];
  if (prefix1 === "N") return upper;
  if (ONE_CHAR_PREFIXES.has(prefix1) && upper.length > 1) return prefix1 + "-" + upper.slice(1);
  return upper;
}

function looksLikeRegistration(val: string): boolean {
  const u = val.toUpperCase();
  if (FALSE_POSITIVES.has(u)) return false;
  if (TWO_CHAR_PREFIXES.has(u.slice(0, 2))) return true;
  if (ONE_CHAR_PREFIXES.has(u[0]) && u[0] !== "N") return true;
  if (u[0] === "N" && /^\d/.test(u[1])) return true;
  return false;
}

function isRegistration(val: string): boolean {
  const v = val.trim().toUpperCase();
  // Strip suffixes: /1, /2 (legs), /P, /C (target), spaces+digits, dashes, parens
  const cleaned = v
    .replace(/\s*\/\s*[A-Z0-9]+$/i, "")  // strip /1, /2, /P, /C
    .replace(/\s*[*(].*$/, "")             // strip * and parens
    .replace(/\s+\d+$/, "")                // strip trailing space+digits
    .trim();
  // Allow registrations starting with digit (9H-xxx, 5A-xxx, 4X-xxx, etc.)
  if (!/^[A-Z0-9][A-Z0-9]{3,6}$/i.test(cleaned)) return false;
  if (/^\d{4,}$/.test(cleaned)) return false; // pure numbers are not registrations
  return looksLikeRegistration(cleaned);
}

function cleanReg(val: string): string {
  const v = val.trim().toUpperCase();
  const cleaned = v.replace(/\s*[/]\s*[PC]$/i, "").replace(/\s*[-*(].*$/, "").replace(/\s*\/.*$/, "").trim();
  return insertDash(cleaned);
}

export function parseExtrasExcel(buffer: Buffer): ExcelParseResult {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: (string | number | null)[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

  const errors: string[] = [];
  const extrasMap = new Map<string, { descriptions: string[]; services: ParsedService[] }>();
  let date = "";

  function addDesc(reg: string, desc: string) {
    if (!extrasMap.has(reg)) extrasMap.set(reg, { descriptions: [], services: [] });
    extrasMap.get(reg)!.descriptions.push(desc);
  }

  function addService(reg: string, svc: ParsedService) {
    if (!extrasMap.has(reg)) extrasMap.set(reg, { descriptions: [], services: [] });
    extrasMap.get(reg)!.services.push(svc);
  }

  // --- Extract date from header ---
  for (const row of rows.slice(0, 2)) {
    for (let j = 0; j < (row?.length || 0); j++) {
      const cell = row[j];
      if (cell && typeof cell === "string") {
        const m = cell.match(/FECHA:\s*/i);
        if (m) {
          const afterFecha = cell.slice(m.index! + m[0].length).trim();
          if (afterFecha) {
            date = afterFecha;
          } else if (row[j + 1]) {
            date = String(row[j + 1]).trim();
          }
        }
      }
    }
  }

  // --- Find special section start ---
  let specialRowStart = rows.length;
  for (let i = 2; i < rows.length; i++) {
    const joined = (rows[i] || []).map(c => c ?? "").join(" ");
    if (/CATERING AIRE:/i.test(joined)) {
      specialRowStart = i;
      break;
    }
  }

  // ===== MAIN SECTION (rows 2 to specialRowStart) =====
  let currentRegLeft: string | null = null;
  let currentRegRight: string | null = null;

  // Cabeceras conocidas que no deben reportarse como matrículas dudosas
  const HEADER_HINTS = /FECHA|CATERING|NETJETS|PRENSA|MCR|RELAY|VUELO|EXTRAS|SKYVALET/i;

  function maybeReportSuspect(col: string, colLabel: string, rowIdx: number) {
    if (!col) return;
    if (col.length <= 1) return;
    if (HEADER_HINTS.test(col)) return;
    errors.push(`Fila ${rowIdx + 1}: valor "${col}" en columna ${colLabel} no parece matrícula y se ha ignorado`);
  }

  for (let i = 2; i < specialRowStart; i++) {
    const row = rows[i] || [];
    const colA = row[0] != null ? String(row[0]).trim() : "";
    const colB = row[1] != null ? String(row[1]).trim() : "";
    const colE = row[4] != null ? String(row[4]).trim() : "";
    const colF = row[5] != null ? String(row[5]).trim() : "";

    if (colA && isRegistration(colA)) {
      currentRegLeft = cleanReg(colA);
      if (colB) addDesc(currentRegLeft, colB);
    } else if (colB && currentRegLeft) {
      addDesc(currentRegLeft, colB);
    } else if (colA && !isRegistration(colA)) {
      maybeReportSuspect(colA, "A", i);
    }

    if (colE && isRegistration(colE)) {
      currentRegRight = cleanReg(colE);
      if (colF) addDesc(currentRegRight, colF);
    } else if (colF && currentRegRight) {
      addDesc(currentRegRight, colF);
    } else if (colE && !isRegistration(colE)) {
      maybeReportSuspect(colE, "E", i);
    }
  }

  // ===== SPECIAL SECTIONS =====
  if (specialRowStart < rows.length) {
    let currentPrensaReg: string | null = null;

    // Prensa can start on the sub-header row (specialRowStart + 1)
    const subHeaderRow = rows[specialRowStart + 1] || [];
    const subPrensaReg = subHeaderRow[5] != null ? String(subHeaderRow[5]).trim() : "";
    const subPrensaTitles = subHeaderRow[6] != null ? String(subHeaderRow[6]).trim() : "";
    if (subPrensaReg && isRegistration(subPrensaReg)) {
      currentPrensaReg = cleanReg(subPrensaReg);
      if (subPrensaTitles && !/^SKYVALET$/i.test(subPrensaTitles)) {
        addService(currentPrensaReg, { type: "NEWSPAPERS", name: subPrensaTitles, origin: "MCR" });
      }
    }

    // Data rows: specialRowStart + 2 onwards
    for (let i = specialRowStart + 2; i < rows.length; i++) {
      const row = rows[i] || [];

      // --- CATERING AIRE (colA = time, colB = registration) ---
      const caireTimeRaw = row[0] != null ? String(row[0]).trim() : "";
      const caireRegRaw = row[1] != null ? String(row[1]).trim() : "";

      if (caireTimeRaw && caireRegRaw) {
        const timeMatch = caireTimeRaw.match(/^(\d{3,4})/);
        if (timeMatch) {
          const regBase = caireRegRaw.replace(/\s*[*/(].*$/, "").trim();
          if (isRegistration(regBase)) {
            const reg = cleanReg(regBase);
            const t = timeMatch[1].padStart(4, "0");
            const timeStr = t.slice(0, 2) + ":" + t.slice(2);
            addService(reg, {
              type: "CATERING",
              name: `Catering Aire ${timeStr}`,
              origin: "Catering Aire",
            });
          }
        }
      }

      // --- CATERING NETJETS (colC = time, colD = ref, colE = reg/type) ---
      const njeTimeRaw = row[2] != null ? String(row[2]).trim() : "";
      const njeRefRaw = row[3] != null ? String(row[3]).trim() : "";
      const njeRegRaw = row[4] != null ? String(row[4]).trim() : "";

      if (njeRegRaw && njeRefRaw && /\d/.test(String(njeRefRaw))) {
        if (/SKYVALET/i.test(njeTimeRaw)) continue;

        // Parse reference: "12297037 - 3" → ref=12297037
        const refMatch = String(njeRefRaw).match(/^(\d+)/);
        if (!refMatch) {
          errors.push(`Fila ${i + 1}: catering NetJets con ref "${njeRefRaw}" / reg "${njeRegRaw}" no parseable`);
        } else {
          const ref = refMatch[1];

          // Parse reg: "CSPHF / P", "CSPHF/C", or leg suffix "CSTZZ/1", "OEHCY/2".
          // Group 1 = registration base. Group 2 = P|C if present; numeric suffixes
          // (/1, /2, …) are accepted and treated as leg markers with no PAX/CREW target.
          const regTypeMatch = njeRegRaw.match(/^([A-Z0-9]+)\s*(?:\/\s*([PC])|\s*\/\s*\d+)?\s*$/i);
          if (regTypeMatch) {
            const reg = cleanReg(regTypeMatch[1]);
            const target = regTypeMatch[2]?.toUpperCase() === "C" ? "CREW"
              : regTypeMatch[2]?.toUpperCase() === "P" ? "PAX"
              : undefined;

            const label = target
              ? `NJE ${target} #${ref}`
              : `NJE #${ref}`;

            addService(reg, {
              type: "CATERING",
              name: label,
              origin: "NetJets",
              reference: ref,
              target,
            });
          }
        }
      }

      // --- PRENSA MCR & RELAY (colF = registration, colG = titles) ---
      const prensaRegRaw = row[5] != null ? String(row[5]).trim() : "";
      const prensaTitlesRaw = row[6] != null ? String(row[6]).trim() : "";

      if (prensaRegRaw && isRegistration(prensaRegRaw)) {
        currentPrensaReg = cleanReg(prensaRegRaw);
        if (prensaTitlesRaw && !/^SKYVALET$/i.test(prensaTitlesRaw)) {
          addService(currentPrensaReg, { type: "NEWSPAPERS", name: prensaTitlesRaw, origin: "MCR" });
        }
      } else if (prensaRegRaw && !isRegistration(prensaRegRaw) && currentPrensaReg) {
        const title = prensaRegRaw.trim();
        if (title.length > 1) {
          addService(currentPrensaReg, { type: "NEWSPAPERS", name: title, origin: "MCR" });
        }
      }
    }
  }

  // ===== BUILD RESULTS =====
  const extras: ParsedExtra[] = [];
  for (const [registration, data] of extrasMap) {
    const mainServices = data.descriptions.flatMap(desc => categorizeService(desc));
    const specialServices = data.services;

    // Deduplicate: each detailed NJE/Catering-Aire entry covers exactly ONE leg's
    // generic "CATERING" from the main section. Suppress one generic CATERING per
    // special catering entry (count-based, per-leg), not all of them globally.
    // This preserves a second leg's generic CATERING when only the first leg has NJE.
    const specialCateringCount = specialServices.filter(s => s.type === "CATERING").length;

    // Suppress up to specialCateringCount generic CATERING entries from main section.
    // CATERING entries are NOT deduplicated before this step — each leg is independent.
    // Non-CATERING entries are deduplicated by exact key to remove repeated descriptions.
    let suppressedCount = 0;
    const nonCateringMainSeen = new Set<string>();
    const filtered = mainServices.filter((s) => {
      if (s.type === "CATERING") {
        // Each CATERING in main section is an independent leg; suppress only those
        // that are covered 1-for-1 by a special (NJE/Catering Aire) entry.
        if (suppressedCount < specialCateringCount) {
          suppressedCount++;
          return false;
        }
        return true;
      }
      // For non-CATERING types, deduplicate identical entries (e.g., same THERMOS
      // description appearing on both legs of a turnaround).
      const key = `${s.type}|${s.name}`;
      if (nonCateringMainSeen.has(key)) return false;
      nonCateringMainSeen.add(key);
      return true;
    });

    const finalServices = [...filtered, ...specialServices];
    if (finalServices.length > 0) {
      extras.push({
        registration,
        rawDescriptions: data.descriptions,
        services: finalServices,
      });
    }
  }

  // Convert date like "13APR", "10ABR", "5MAY" to YYYY-MM-DD
  const parsedDate = parseExcelDate(date);

  if (!date) {
    errors.push("No se ha podido detectar la fecha del Excel — usar la fecha actual");
  }

  return { date: parsedDate || date, extras, errors };
}

const MONTH_MAP: Record<string, number> = {
  JAN: 0, JANUARY: 0, FEB: 1, FEBRUARY: 1, MAR: 2, MARCH: 2,
  APR: 3, APRIL: 3, MAY: 4, JUN: 5, JUNE: 5,
  JUL: 6, JULY: 6, AUG: 7, AUGUST: 7, SEP: 8, SEPTEMBER: 8,
  OCT: 9, OCTOBER: 9, NOV: 10, NOVEMBER: 10, DEC: 11, DECEMBER: 11,
  ENE: 0, ENERO: 0, FEV: 1, FEBRERO: 1, MAR2: 2, MARZO: 2,
  ABR: 3, ABRIL: 3, MAYO: 4, JUN2: 5, JUNIO: 5,
  JUL2: 6, JULIO: 6, AGO: 7, AGOSTO: 7, SET: 8, SEPTIEMBRE: 8,
  OCT2: 9, OCTUBRE: 9, NOV2: 10, NOVIEMBRE: 10, DIC: 11, DICIEMBRE: 11,
};

function parseExcelDate(raw: string): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().toUpperCase().replace(/\s+/g, "");
  // Match "13APR", "5MAY", "10ABR", "01APRIL", "13APR26", etc.
  const m = cleaned.match(/^(\d{1,2})([A-Z]{3,10})(\d{2,4})?$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const monthStr = m[2];
  const month = MONTH_MAP[monthStr];
  if (month === undefined) return null;
  let year: number;
  if (m[3]) {
    year = parseInt(m[3], 10);
    if (year < 100) year += 2000;
  } else {
    year = new Date().getFullYear();
  }
  const dd = String(day).padStart(2, "0");
  const mm = String(month + 1).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function categorizeService(desc: string): ParsedService[] {
  const upper = desc.toUpperCase().trim();
  if (upper.length < 2) return [];
  if (/^REG:|^HORA:|^VUELO:/.test(upper)) return [];

  // Skip leaked registrations
  if (/^[A-Z0-9]{4,7}$/.test(upper) && looksLikeRegistration(upper)) return [];

  // Split compound descriptions by comma
  const parts = desc.split(/[,]+/).map(p => p.trim()).filter(p => p.length > 1);
  if (parts.length > 1) {
    return parts.flatMap(part => categorizeService(part));
  }

  // Split by " + "
  const plusParts = desc.split(/\s*\+\s*/).map(p => p.trim()).filter(p => p.length > 1);
  if (plusParts.length > 1) {
    return plusParts.flatMap(part => categorizeService(part));
  }

  // Extract quantity prefix: "2x BOLSA NEVERA", "01 TERMO", etc.
  // Only accept as quantity if: explicit "x" separator, or single digit (1-9)
  // followed by a service word (not units like KG, PAX, MIN, BAGS, etc.)
  let quantity = 1;
  let cleaned = desc.trim();
  const qtyExplicit = cleaned.match(/^(\d+)\s*[xX]\s+(.+)/);
  const qtyImplicit = cleaned.match(/^(0?[1-9])\s+(.+)/);
  // Words that mean the number is part of the description, not a repetition count
  const NOT_QTY_NEXT = /^(KG|PAX|MIN|BAGS?|BULTOS|HORAS?|PERSONAS?|COCHES?|FURG)\b/i;
  if (qtyExplicit) {
    quantity = parseInt(qtyExplicit[1], 10) || 1;
    cleaned = qtyExplicit[2];
  } else if (qtyImplicit && !NOT_QTY_NEXT.test(qtyImplicit[2])) {
    quantity = parseInt(qtyImplicit[1], 10) || 1;
    cleaned = qtyImplicit[2];
  }

  const u = cleaned.toUpperCase();

  if (/CATER|CATE\b|COMIDA|MENUS?\b|MENÚS?/.test(u) && !/CATERING AIRE|CATERING NJE|CATERING NETJETS/.test(u)) {
    return [{ type: "CATERING", name: cleaned, quantity }];
  }
  if (/VAJILLA|CUBIERTOS|TENEDORES/.test(u)) {
    return [{ type: "DISHES", name: cleaned, quantity }];
  }
  if (/BOLSA\s*(DE\s+|EN\s+)?NEVERA|NEVERA|CONGELADOR|HIELO|PLACA|CAJA.*NEVERA/.test(u)) {
    return [{ type: "COOLER_BAG", name: cleaned, quantity }];
  }
  if (/BOLSA\s*(DE\s+)?ALMAC[EÉ]N|ALMAC[EÉ]N|CESTA/.test(u)) {
    return [{ type: "STORAGE_BAG", name: cleaned, quantity }];
  }
  if (/LAUNDRY|LINEN|NORDICO|MANTA/.test(u)) {
    return [{ type: "LAUNDRY", name: cleaned, quantity }];
  }
  if (/TERMO|TERMOS|THERMOS/.test(u) && !/BOLSA.*NEVERA/.test(u)) {
    return [{ type: "THERMOS", name: cleaned, quantity }];
  }
  if (/PRENS|PRESS|PERI[OÓ]DIC|REVIST/.test(u)) {
    return [{ type: "NEWSPAPERS", name: cleaned, quantity }];
  }

  return [{ type: "CUSTOM", name: cleaned, quantity }];
}
