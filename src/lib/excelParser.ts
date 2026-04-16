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
  const cleaned = v.replace(/\s*[-*(].*$/, "").replace(/\s+\d+$/, "");
  if (!/^[A-Z][A-Z0-9]{3,6}$/i.test(cleaned)) return false;
  if (/^\d{4}$/.test(cleaned)) return false;
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
    }

    if (colE && isRegistration(colE)) {
      currentRegRight = cleanReg(colE);
      if (colF) addDesc(currentRegRight, colF);
    } else if (colF && currentRegRight) {
      addDesc(currentRegRight, colF);
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
        if (refMatch) {
          const ref = refMatch[1];

          // Parse reg: "CSPHF / P" or "CSPHF/C"
          const regTypeMatch = njeRegRaw.match(/^([A-Z0-9]+)\s*\/?\s*([PC])?$/i);
          if (regTypeMatch) {
            const reg = cleanReg(regTypeMatch[1]);
            const target = regTypeMatch[2]?.toUpperCase() === "C" ? "CREW"
              : regTypeMatch[2]?.toUpperCase() === "P" ? "PAX"
              : undefined;

            let timeStr = "";
            if (njeTimeRaw) {
              const tm = String(njeTimeRaw).replace(/[^0-9]/g, "").padStart(4, "0");
              timeStr = tm.slice(0, 2) + ":" + tm.slice(2);
            }

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
    const allServices = [...mainServices, ...data.services];
    if (allServices.length > 0) {
      extras.push({
        registration,
        rawDescriptions: data.descriptions,
        services: allServices,
      });
    }
  }

  return { date, extras, errors };
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

  // Extract quantity prefix
  let quantity = 1;
  let cleaned = desc.trim();
  const qtyMatch = cleaned.match(/^(\d+)\s*[xX]?\s+(.+)/);
  if (qtyMatch) {
    quantity = parseInt(qtyMatch[1], 10) || 1;
    cleaned = qtyMatch[2];
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
