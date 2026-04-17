// LEPA/PMI parking stands registry
// Source: AIP Spain AD 2-LEPA/LESJ PDC (official chart)
//
// Areas:
//   GA    = General Aviation Apron (stands 150-247) — MALLORCAIR FBO home base
//   TERM  = Commercial terminal stands (02-123) — far from GA
//   HELI  = Helicopter stands (301-318B)
//   REMOTE = Remote stands (far from any terminal)

export type StandArea = "GA" | "TERM" | "HELI" | "REMOTE" | "UNKNOWN";

export interface StandInfo {
  id: string;            // e.g. "P220", "220", normalized
  number: string;        // display number e.g. "220"
  ramp: string;          // e.g. "R17"
  area: StandArea;
  maxWingspan?: number;  // meters
  maxAircraft?: string;  // e.g. "A321", "B738", "30m"
  noseTo?: "E" | "W" | "N" | "S"; // direction for nose-in
  hasPower?: boolean;    // 400Hz available
  incompatibleWith?: string[]; // stands that cannot be occupied simultaneously
  notes?: string;
}

// ─── GA APN stands (main FBO area) ───
const GA_STANDS: StandInfo[] = [
  // 150-159 — large aircraft area with INCOMP alternatives
  { id: "150", number: "150", ramp: "R15", area: "GA", maxAircraft: "B738", noseTo: "E" },
  { id: "151", number: "151", ramp: "R15", area: "GA", maxAircraft: "B738", noseTo: "E" },
  { id: "152", number: "152", ramp: "R16", area: "GA", maxAircraft: "B738", noseTo: "E" },
  { id: "153", number: "153", ramp: "R16", area: "GA", maxAircraft: "B753", noseTo: "E" },
  { id: "154", number: "154", ramp: "R16", area: "GA", maxAircraft: "B753", noseTo: "E", incompatibleWith: ["154B"] },
  { id: "154B", number: "154B", ramp: "R16", area: "GA", maxWingspan: 30, incompatibleWith: ["154"] },
  { id: "155", number: "155", ramp: "R17", area: "GA", maxAircraft: "B753", noseTo: "E", incompatibleWith: ["155B"] },
  { id: "155B", number: "155B", ramp: "R17", area: "GA", maxWingspan: 30, incompatibleWith: ["155"] },
  { id: "156", number: "156", ramp: "R17", area: "GA", maxAircraft: "B753", noseTo: "E", incompatibleWith: ["156B"] },
  { id: "156B", number: "156B", ramp: "R17", area: "GA", maxWingspan: 30, incompatibleWith: ["156"] },
  { id: "157", number: "157", ramp: "R17", area: "GA", maxAircraft: "B753", noseTo: "E", incompatibleWith: ["157B"] },
  { id: "157B", number: "157B", ramp: "R17", area: "GA", maxWingspan: 30, incompatibleWith: ["157"] },
  { id: "158", number: "158", ramp: "R17", area: "GA", maxAircraft: "B753", noseTo: "E", incompatibleWith: ["158B"] },
  { id: "158B", number: "158B", ramp: "R17", area: "GA", maxWingspan: 30, incompatibleWith: ["158"] },
  { id: "159", number: "159", ramp: "R17", area: "GA", maxWingspan: 30 },

  // 200-226 — 20m wingspan max, nose-to WEST
  ...range(200, 226).map((n) => ({
    id: String(n), number: String(n), ramp: "R17", area: "GA" as const, maxWingspan: 20, noseTo: "W" as const,
  })),
  { id: "226", number: "226", ramp: "R17", area: "GA", maxWingspan: 12, noseTo: "W" }, // override: 226 is 12m

  // 227-241 — 30m wingspan max, nose-to EAST
  ...range(227, 241).map((n) => ({
    id: String(n), number: String(n), ramp: "R17", area: "GA" as const, maxWingspan: 30, noseTo: "E" as const,
  })),

  // 242-247 — 12m wingspan max, nose-to EAST (light aircraft)
  ...range(242, 247).map((n) => ({
    id: String(n), number: String(n), ramp: "R17", area: "GA" as const, maxWingspan: 12, noseTo: "E" as const,
  })),
];

// ─── Helicopter stands ───
const HELI_STANDS: StandInfo[] = [
  { id: "301", ramp: "R1", number: "301", area: "HELI", maxAircraft: "A139", incompatibleWith: ["306"] },
  { id: "303", ramp: "R1", number: "303", area: "HELI", maxAircraft: "BE20", incompatibleWith: ["306"] },
  { id: "306", ramp: "R1", number: "306", area: "HELI", maxAircraft: "A124", incompatibleWith: ["301", "303", "307", "307B", "308", "309"] },
  { id: "307", ramp: "R1", number: "307", area: "HELI", maxAircraft: "B763", incompatibleWith: ["306", "307B"] },
  { id: "307B", ramp: "R1", number: "307B", area: "HELI", maxAircraft: "E135", incompatibleWith: ["306", "307"] },
  { id: "308", ramp: "R1", number: "308", area: "HELI", maxAircraft: "B763/B412", incompatibleWith: ["306", "308B"] },
  { id: "308B", ramp: "R1", number: "308B", area: "HELI", maxAircraft: "E135", incompatibleWith: ["308"] },
  { id: "309", ramp: "R1", number: "309", area: "HELI", maxAircraft: "B763/B412", incompatibleWith: ["306", "309B"] },
  { id: "309B", ramp: "R1", number: "309B", area: "HELI", maxAircraft: "E135", incompatibleWith: ["309"] },
  { id: "310", ramp: "R2", number: "310", area: "HELI", maxAircraft: "B763/B412", incompatibleWith: ["310B"] },
  { id: "310B", ramp: "R2", number: "310B", area: "HELI", maxAircraft: "E135", incompatibleWith: ["310"] },
  { id: "311", ramp: "R2", number: "311", area: "HELI", maxAircraft: "B738" },
  { id: "312", ramp: "R2", number: "312", area: "HELI", maxAircraft: "A333" },
  { id: "313", ramp: "R2", number: "313", area: "HELI", maxAircraft: "A333" },
  { id: "314", ramp: "R2", number: "314", area: "HELI", maxAircraft: "B763" },
  { id: "315", ramp: "R2", number: "315", area: "HELI", maxAircraft: "B753", incompatibleWith: ["315B"] },
  { id: "315B", ramp: "R2", number: "315B", area: "HELI", maxWingspan: 30, incompatibleWith: ["315"] },
  { id: "316", ramp: "R2", number: "316", area: "HELI", maxAircraft: "B763", incompatibleWith: ["316B"] },
  { id: "316B", ramp: "R2", number: "316B", area: "HELI", maxWingspan: 30, incompatibleWith: ["316"] },
  { id: "317", ramp: "R2", number: "317", area: "HELI", maxAircraft: "B763", incompatibleWith: ["317B"] },
  { id: "317B", ramp: "R2", number: "317B", area: "HELI", maxWingspan: 30, incompatibleWith: ["317"] },
  { id: "318", ramp: "R2", number: "318", area: "HELI", maxAircraft: "B763", incompatibleWith: ["318B"] },
  { id: "318B", ramp: "R2", number: "318B", area: "HELI", maxWingspan: 30, incompatibleWith: ["318"] },
];

// ─── Terminal stands (REMOTE from GA — warning when a bizjet lands here) ───
// Only listing the ones that commonly appear in GA ops data. Full range is 02-123.
const TERMINAL_STANDS: StandInfo[] = [
  ...range(2, 25).filter((n) => n !== 1).map((n) => ({
    id: String(n).padStart(2, "0"), number: String(n).padStart(2, "0"),
    ramp: "R3-R7", area: "TERM" as const, maxAircraft: "A321",
  })),
  ...range(26, 58).map((n) => ({
    id: String(n), number: String(n),
    ramp: "R8-R11", area: "TERM" as const, maxAircraft: "A321/B738",
  })),
  ...range(60, 98).map((n) => ({
    id: String(n), number: String(n),
    ramp: "R13-R15", area: "TERM" as const, maxAircraft: "A321",
  })),
  ...range(100, 123).map((n) => ({
    id: String(n), number: String(n),
    ramp: "R3-R8", area: "TERM" as const, maxAircraft: "B763",
  })),
];

// ─── Combined index ───
const ALL_STANDS: StandInfo[] = [...GA_STANDS, ...HELI_STANDS, ...TERMINAL_STANDS];
const STAND_INDEX = new Map<string, StandInfo>();
for (const s of ALL_STANDS) {
  STAND_INDEX.set(s.id.toUpperCase(), s);
  STAND_INDEX.set(s.id.toUpperCase().replace(/^0+/, ""), s); // also without leading zeros
}

// ─── Public API ───

/** Normalize a parking string to a lookup key (strip "P" prefix, uppercase) */
function normalizeParking(parking: string | null | undefined): string {
  if (!parking) return "";
  return parking.toUpperCase().trim().replace(/^P/, "").replace(/\s+/g, "");
}

/** Look up a stand by parking code (e.g. "P220", "220", "p220") */
export function getStand(parking: string | null | undefined): StandInfo | null {
  const key = normalizeParking(parking);
  if (!key) return null;
  return STAND_INDEX.get(key) || null;
}

/** Is this parking on the GA apron (MALLORCAIR home base)? */
export function isInGA(parking: string | null | undefined): boolean {
  const stand = getStand(parking);
  return stand?.area === "GA";
}

/** Is this parking FAR from the GA apron (terminal stand, remote, etc.)? */
export function isFarFromGA(parking: string | null | undefined): boolean {
  const stand = getStand(parking);
  if (!stand) return false; // unknown parking — don't flag
  return stand.area === "TERM" || stand.area === "REMOTE";
}

/** Short description of a parking location for tooltips */
export function getStandDescription(parking: string | null | undefined): string {
  const stand = getStand(parking);
  if (!stand) return parking ? `Parking ${parking} (no catalogado)` : "Sin parking asignado";
  const area = stand.area === "GA" ? "GA apron" : stand.area === "TERM" ? "Terminal comercial" : stand.area === "HELI" ? "Helipuertos" : "Remoto";
  const parts = [area, `Ramp ${stand.ramp}`];
  if (stand.maxAircraft) parts.push(`Max: ${stand.maxAircraft}`);
  else if (stand.maxWingspan) parts.push(`Max ${stand.maxWingspan}m envergadura`);
  return parts.join(" • ");
}

// ─── Aircraft type → wingspan (meters) for compatibility validation ───
const AIRCRAFT_WINGSPANS: Record<string, number> = {
  // Turboprops / small
  BE20: 18, BE40: 13, BE9L: 15, BE36: 10, BE58: 11,
  PC12: 16, PC24: 17,
  C25A: 15, C25B: 17, C25C: 17, C25M: 15, C510: 14, C525: 14, C550: 15, C560: 16,
  // Light jets
  C56X: 17, C650: 16, C680: 19, C68A: 20, C700: 20, C750: 19,
  CJ1: 14, CJ2: 15, CJ3: 16, CJ4: 15,
  // Mid-size jets (CL/FA/HAWKER)
  CL30: 20, CL35: 21, CL60: 19, CL64: 20, CL65: 20,
  CRJ1: 21, CRJ2: 21, CRJ7: 23, CRJ9: 25,
  E50P: 13, E55P: 15, E545: 20, E135: 20, E145: 20,
  F2TH: 19, F900: 20, FA50: 19, FA7X: 26, FA8X: 26,
  H25A: 14, H25B: 16, H25C: 16,
  HA4T: 14, HDJT: 13,
  // Super mid / large
  GLF3: 24, GLF4: 24, GLF5: 29, GLF6: 29,
  GLEX: 28, GL7T: 31, GL5T: 29,
  G150: 17, G200: 18, G280: 19, G450: 24, G550: 29, G650: 30,
  E170: 26, E175: 26, E190: 29, E195: 29,
  // Airliners
  A318: 34, A319: 34, A320: 36, A321: 36, A332: 60, A333: 60, A339: 64, A346: 63,
  B733: 29, B734: 29, B735: 29, B736: 34, B737: 36, B738: 36, B739: 36, B38M: 36, B39M: 36,
  B744: 65, B748: 68, B752: 38, B753: 38, B762: 47, B763: 47, B764: 51,
  B772: 61, B773: 61, B77L: 65, B77W: 65, B788: 60, B789: 60,
};

export interface CompatibilityCheck {
  ok: boolean;
  severity: "ok" | "info" | "warning" | "error";
  message?: string;
}

/**
 * Check if an aircraft type fits on a given parking stand.
 * Returns warnings for oversized aircraft or remote parking.
 */
export function checkCompatibility(aircraftType: string | null | undefined, parking: string | null | undefined): CompatibilityCheck {
  const stand = getStand(parking);
  if (!parking || !aircraftType) return { ok: true, severity: "ok" };
  if (!stand) return { ok: true, severity: "info", message: `Stand ${parking} no catalogado` };

  const wingspan = AIRCRAFT_WINGSPANS[aircraftType.toUpperCase()];
  if (stand.maxWingspan && wingspan && wingspan > stand.maxWingspan) {
    return {
      ok: false,
      severity: "error",
      message: `${aircraftType} (${wingspan}m) excede el limite de ${stand.maxWingspan}m del stand ${stand.id}`,
    };
  }

  if (isFarFromGA(parking)) {
    return {
      ok: true,
      severity: "warning",
      message: `Stand ${stand.id} esta en ${stand.area === "TERM" ? "terminal comercial" : "remoto"} — lejos del FBO`,
    };
  }

  return { ok: true, severity: "ok" };
}

// ─── Utility ───
function range(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

/** All known stands (for admin/debug views) */
export function getAllStands(): StandInfo[] {
  return ALL_STANDS;
}
