// Helpers para la vista /timeline (24h horizontal scale).
// Lógica pura, fácil de testear.

import type { Flight, Service } from "@prisma/client";

const MIN_PER_DAY = 24 * 60;

/** Parsea HH:MM Zulu a minutos desde 00:00. Devuelve null si invalido. */
export function parseHHMM(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

/** Convierte minutos-del-dia a porcentaje 0..100 del eje. */
export function minutesToPercent(min: number | null): number | null {
  if (min === null) return null;
  return (min / MIN_PER_DAY) * 100;
}

/** Posicion NOW (Zulu) como porcentaje del dia. */
export function nowZuluPercent(now: Date = new Date()): number {
  const m = now.getUTCHours() * 60 + now.getUTCMinutes();
  return (m / MIN_PER_DAY) * 100;
}

export type BarBounds = {
  /** Inicio en % (0-100) */
  startPct: number;
  /** Fin en % (0-100) */
  endPct: number;
  /** Si es una "estancia" real (eta+etd) o un marker corto (solo eta o solo etd). */
  kind: "stay" | "arrival-only" | "departure-only";
};

const ARRIVAL_ONLY_BAR_MINUTES = 90;   // si solo hay ETA (sin ETD), pinta 90 min de bar
const DEPARTURE_ONLY_BAR_MINUTES = 90; // si solo hay ETD (sin ETA), pinta 90 min antes
const MIN_BAR_PCT = 1.5;               // ancho mínimo visible (~21 min)

/**
 * Calcula el bar para un vuelo en /timeline. Si el vuelo es overnight con
 * arrivalDate previa al dia visualizado, el bar empieza en 0%. Si la
 * departureDate es posterior, el bar termina en 100%.
 */
export function computeBarBounds(
  flight: Pick<Flight, "eta" | "etd" | "arrivalDate" | "departureDate">,
  viewDayShort: string, // "DD/MM"
): BarBounds | null {
  const etaMin = parseHHMM(flight.eta);
  const etdMin = parseHHMM(flight.etd);
  if (etaMin === null && etdMin === null) return null;

  const arrToday = !flight.arrivalDate || flight.arrivalDate.slice(0, 5) === viewDayShort;
  const depToday = !flight.departureDate || flight.departureDate.slice(0, 5) === viewDayShort;

  // Estancia completa: arr y dep hoy → bar de eta a etd
  if (etaMin !== null && etdMin !== null && arrToday && depToday) {
    let start = (etaMin / MIN_PER_DAY) * 100;
    let end = (etdMin / MIN_PER_DAY) * 100;
    if (end < start) end = 100; // proteccion overflow medianoche
    if (end - start < MIN_BAR_PCT) end = start + MIN_BAR_PCT;
    return { startPct: start, endPct: end, kind: "stay" };
  }

  // Overnight que llega ayer y sale hoy: empieza en 0%, termina en etd
  if (!arrToday && depToday && etdMin !== null) {
    return {
      startPct: 0,
      endPct: Math.max((etdMin / MIN_PER_DAY) * 100, MIN_BAR_PCT),
      kind: "stay",
    };
  }

  // Overnight que llega hoy y sale mañana: empieza en eta, termina en 100%
  if (arrToday && !depToday && etaMin !== null) {
    const start = (etaMin / MIN_PER_DAY) * 100;
    return { startPct: start, endPct: 100, kind: "stay" };
  }

  // Solo arrival hoy (sin etd o etd no de hoy): bar corto a partir de ETA
  if (arrToday && etaMin !== null) {
    const start = (etaMin / MIN_PER_DAY) * 100;
    return {
      startPct: start,
      endPct: Math.min(start + (ARRIVAL_ONLY_BAR_MINUTES / MIN_PER_DAY) * 100, 100),
      kind: "arrival-only",
    };
  }

  // Solo departure hoy: bar corto antes de ETD
  if (depToday && etdMin !== null) {
    const end = (etdMin / MIN_PER_DAY) * 100;
    return {
      startPct: Math.max(end - (DEPARTURE_ONLY_BAR_MINUTES / MIN_PER_DAY) * 100, 0),
      endPct: end,
      kind: "departure-only",
    };
  }

  return null;
}

export type Pip = {
  pct: number;
  kind: "fuel-req" | "fuel-served" | "toilet-req" | "toilet-done" | "svc-arrived" | "svc-delivered";
  label: string;
};

/** Lista de pips (eventos timestamped) para superponer al bar del vuelo. */
export function flightPips(
  flight: Pick<Flight, "fuelRequestedAt" | "fuelServedAt" | "toiletRequestedAt" | "toiletCompletedAt">,
  services: Pick<Service, "type" | "arrivedAt" | "deliveredAt">[],
): Pip[] {
  const pips: Pip[] = [];
  const add = (raw: string | null, kind: Pip["kind"], label: string) => {
    const m = parseHHMM(raw);
    if (m !== null) pips.push({ pct: (m / MIN_PER_DAY) * 100, kind, label });
  };
  add(flight.fuelRequestedAt, "fuel-req", `Fuel pedido ${flight.fuelRequestedAt}`);
  add(flight.fuelServedAt, "fuel-served", `Fuel servido ${flight.fuelServedAt}`);
  add(flight.toiletRequestedAt, "toilet-req", `Toilet pedido ${flight.toiletRequestedAt}`);
  add(flight.toiletCompletedAt, "toilet-done", `Toilet ok ${flight.toiletCompletedAt}`);
  for (const s of services) {
    add(s.arrivedAt, "svc-arrived", `${s.type} llegado ${s.arrivedAt}`);
    add(s.deliveredAt, "svc-delivered", `${s.type} entregado ${s.deliveredAt}`);
  }
  return pips;
}

/** Color del bar según estado. Tailwind classes (bg + ring). */
export const BAR_COLOR: Record<string, { bar: string; bg: string; text: string }> = {
  EXPECTED: { bar: "bg-gray-300",     bg: "bg-gray-200",   text: "text-gray-700" },
  ARRIVING: { bar: "bg-blue-500",     bg: "bg-blue-100",   text: "text-blue-800" },
  PARKED:   { bar: "bg-purple-500",   bg: "bg-purple-100", text: "text-purple-800" },
  DEPARTING:{ bar: "bg-cyan-500",     bg: "bg-cyan-100",   text: "text-cyan-800" },
  DEPARTED: { bar: "bg-emerald-600",  bg: "bg-emerald-100",text: "text-emerald-800" },
  // Legacy compat
  ON_BLOCKS: { bar: "bg-blue-500",     bg: "bg-blue-100",   text: "text-blue-800" },
  TURNAROUND:{ bar: "bg-cyan-500",     bg: "bg-cyan-100",   text: "text-cyan-800" },
  BOARDING:  { bar: "bg-orange-500",   bg: "bg-orange-100", text: "text-orange-800" },
  OFF_BLOCKS:{ bar: "bg-emerald-600",  bg: "bg-emerald-100",text: "text-emerald-800" },
};
