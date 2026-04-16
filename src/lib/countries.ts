// ICAO airport prefix → Schengen/EU classification
// Used to auto-detect if a flight requires Policia Nacional or Guardia Civil
//
// Rules at LEPA (Spain, Schengen + EU):
// - Arrival from non-Schengen → Policia Nacional (passport stamps)
// - Arrival from non-EU → Guardia Civil (luggage screening)
// - Both apply for origins outside both (e.g., Morocco, USA)

// ICAO first 2 letters → country/region mapping
// Source: ICAO Doc 7910 Location Indicators

interface CountryInfo {
  schengen: boolean;
  eu: boolean;
}

// Map of ICAO airport prefix (first 2 chars) → country classification
const ICAO_PREFIX_MAP: Record<string, CountryInfo> = {
  // === SCHENGEN + EU ===
  EB: { schengen: true, eu: true },   // Belgium
  ED: { schengen: true, eu: true },   // Germany (civil)
  ET: { schengen: true, eu: true },   // Germany (military)
  EE: { schengen: true, eu: true },   // Estonia
  EF: { schengen: true, eu: true },   // Finland
  EH: { schengen: true, eu: true },   // Netherlands
  EK: { schengen: true, eu: true },   // Denmark
  EL: { schengen: true, eu: true },   // Luxembourg
  EN: { schengen: true, eu: true },   // Norway (Schengen, not EU — but treated as Schengen for border)
  EP: { schengen: true, eu: true },   // Poland
  ES: { schengen: true, eu: true },   // Sweden
  EV: { schengen: true, eu: true },   // Latvia
  EY: { schengen: true, eu: true },   // Lithuania
  BI: { schengen: true, eu: false },  // Iceland (Schengen, not EU)
  LE: { schengen: true, eu: true },   // Spain
  LF: { schengen: true, eu: true },   // France
  LI: { schengen: true, eu: true },   // Italy
  LP: { schengen: true, eu: true },   // Portugal
  LO: { schengen: true, eu: true },   // Austria
  LS: { schengen: true, eu: false },  // Switzerland (Schengen, not EU)
  LK: { schengen: true, eu: true },   // Czech Republic
  LH: { schengen: true, eu: true },   // Hungary
  LZ: { schengen: true, eu: true },   // Slovakia
  LJ: { schengen: true, eu: true },   // Slovenia
  LG: { schengen: true, eu: true },   // Greece
  LM: { schengen: true, eu: true },   // Malta
  LC: { schengen: true, eu: true },   // Cyprus (EU, Schengen in practice for air)
  LX: { schengen: true, eu: true },   // Luxembourg (alternate)
  EI: { schengen: false, eu: true },  // Ireland (EU, not Schengen)

  // === EU but NOT SCHENGEN ===
  LB: { schengen: false, eu: true },  // Bulgaria
  LR: { schengen: false, eu: true },  // Romania

  // === SCHENGEN ASSOCIATES (treated as Schengen) ===
  // EN already covered (Norway)
  // LS already covered (Switzerland)
  // BI already covered (Iceland)
  LN: { schengen: true, eu: false },  // Liechtenstein (via Switzerland)

  // === NON-SCHENGEN, NON-EU (European) ===
  EG: { schengen: false, eu: false }, // United Kingdom
  LA: { schengen: false, eu: false }, // Albania
  LD: { schengen: false, eu: false }, // Croatia (joined Schengen 2023 — update if needed)
  LT: { schengen: false, eu: false }, // Turkey
  LU: { schengen: false, eu: false }, // Moldova
  LW: { schengen: false, eu: false }, // North Macedonia
  LY: { schengen: false, eu: false }, // Serbia
  LQ: { schengen: false, eu: false }, // Bosnia
  UK: { schengen: false, eu: false }, // Ukraine
  UM: { schengen: false, eu: false }, // Belarus

  // === AFRICA ===
  DA: { schengen: false, eu: false }, // Algeria
  DT: { schengen: false, eu: false }, // Tunisia
  GM: { schengen: false, eu: false }, // Morocco
  HE: { schengen: false, eu: false }, // Egypt
  HA: { schengen: false, eu: false }, // Ethiopia
  HK: { schengen: false, eu: false }, // Kenya
  FA: { schengen: false, eu: false }, // South Africa
  DN: { schengen: false, eu: false }, // Nigeria
  FV: { schengen: false, eu: false }, // Zimbabwe
  GO: { schengen: false, eu: false }, // Senegal

  // === MIDDLE EAST ===
  OA: { schengen: false, eu: false }, // Afghanistan
  OB: { schengen: false, eu: false }, // Bahrain
  OE: { schengen: false, eu: false }, // Saudi Arabia
  OI: { schengen: false, eu: false }, // Iran
  OJ: { schengen: false, eu: false }, // Jordan
  OK: { schengen: false, eu: false }, // Kuwait
  OL: { schengen: false, eu: false }, // Lebanon
  OM: { schengen: false, eu: false }, // UAE
  OO: { schengen: false, eu: false }, // Oman
  OR: { schengen: false, eu: false }, // Iraq
  OS: { schengen: false, eu: false }, // Syria
  OT: { schengen: false, eu: false }, // Qatar
  LL: { schengen: false, eu: false }, // Israel

  // === AMERICAS ===
  K: { schengen: false, eu: false },  // USA (single letter prefix)
  C: { schengen: false, eu: false },  // Canada
  MM: { schengen: false, eu: false }, // Mexico
  SB: { schengen: false, eu: false }, // Brazil
  SA: { schengen: false, eu: false }, // Argentina
  SK: { schengen: false, eu: false }, // Colombia
  TJ: { schengen: false, eu: false }, // Puerto Rico
  MK: { schengen: false, eu: false }, // Jamaica
  TB: { schengen: false, eu: false }, // Barbados

  // === ASIA/PACIFIC ===
  VT: { schengen: false, eu: false }, // India
  ZB: { schengen: false, eu: false }, // China
  ZS: { schengen: false, eu: false }, // China (south)
  RJ: { schengen: false, eu: false }, // Japan
  RK: { schengen: false, eu: false }, // South Korea
  WS: { schengen: false, eu: false }, // Singapore
  VH: { schengen: false, eu: false }, // Hong Kong
  RP: { schengen: false, eu: false }, // Philippines
  WA: { schengen: false, eu: false }, // Indonesia
  VV: { schengen: false, eu: false }, // Vietnam
  VN: { schengen: false, eu: false }, // Nepal

  // === RUSSIA/CIS ===
  UU: { schengen: false, eu: false }, // Russia (Moscow)
  UL: { schengen: false, eu: false }, // Russia (NW)
  UR: { schengen: false, eu: false }, // Russia (various)
  UG: { schengen: false, eu: false }, // Georgia
  UD: { schengen: false, eu: false }, // Armenia
  UB: { schengen: false, eu: false }, // Azerbaijan
  UT: { schengen: false, eu: false }, // Turkmenistan/Uzbekistan/Tajikistan
  UA: { schengen: false, eu: false }, // Kazakhstan
};

// Croatia joined Schengen on 1 Jan 2023
ICAO_PREFIX_MAP.LD = { schengen: true, eu: true };

function getCountryInfo(icaoCode: string): CountryInfo | null {
  if (!icaoCode) return null;
  const upper = icaoCode.toUpperCase().trim();

  // Try 2-letter prefix first (most ICAO codes)
  const prefix2 = upper.slice(0, 2);
  if (ICAO_PREFIX_MAP[prefix2]) return ICAO_PREFIX_MAP[prefix2];

  // Try 1-letter prefix (K=USA, C=Canada)
  const prefix1 = upper[0];
  if (ICAO_PREFIX_MAP[prefix1]) return ICAO_PREFIX_MAP[prefix1];

  return null;
}

export function isSchengen(icaoCode: string): boolean {
  return getCountryInfo(icaoCode)?.schengen ?? false;
}

export function isEU(icaoCode: string): boolean {
  return getCountryInfo(icaoCode)?.eu ?? false;
}

/**
 * Determine which authorities are required for a flight arriving from `origin` to LEPA
 * - Policia Nacional: non-Schengen origins (passport control)
 * - Guardia Civil: non-EU origins (luggage screening)
 */
export function getRequiredAuthorities(origin: string | null | undefined): {
  policia: boolean;
  guardaCivil: boolean;
} {
  if (!origin) return { policia: false, guardaCivil: false };
  const info = getCountryInfo(origin);
  if (!info) return { policia: false, guardaCivil: false }; // Unknown origin — don't flag
  return {
    policia: !info.schengen,
    guardaCivil: !info.eu,
  };
}
