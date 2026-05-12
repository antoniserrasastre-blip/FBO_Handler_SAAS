// Helpers para la vista /timeline (eje horizontal con rango configurable).
// Por defecto operamos en la ventana 06:00 - 24:00 (jornada operativa LEPA).
// Lógica pura, fácil de testear.

import type { Flight, Service } from "@prisma/client";

export type TimelineRange = { startMin: number; endMin: number };

/** Rango por defecto: 06:00 → 24:00 Zulu. */
export const OPS_RANGE: TimelineRange = { startMin: 6 * 60, endMin: 24 * 60 };

/** Variantes de zoom — la ventana se centra alrededor del NOW Zulu. */
export function zoomedRange(zoom: 6 | 12 | 24, now: Date = new Date()): TimelineRange {
  if (zoom === 24) return OPS_RANGE;
  const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const half = (zoom * 60) / 2;
  let start = nowMin - half;
  let end = nowMin + half;
  if (start < 0) { end -= start; start = 0; }
  if (end > 24 * 60) { start -= end - 24 * 60; end = 24 * 60; }
  return { startMin: Math.max(0, start), endMin: Math.min(24 * 60, end) };
}

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

/** Convierte minutos-del-dia a porcentaje 0..100 dentro de la ventana visible. */
export function minToPct(min: number, range: TimelineRange = OPS_RANGE): number {
  const total = range.endMin - range.startMin;
  return ((min - range.startMin) / total) * 100;
}

/** Posicion NOW (Zulu) como porcentaje del rango. */
export function nowPctInRange(now: Date = new Date(), range: TimelineRange = OPS_RANGE): number {
  const m = now.getUTCHours() * 60 + now.getUTCMinutes();
  return minToPct(m, range);
}

export type BarBounds = {
  startPct: number;
  endPct: number;
  kind: "stay" | "arrival-only" | "departure-only";
};

const ARRIVAL_ONLY_BAR_MINUTES = 90;
const DEPARTURE_ONLY_BAR_MINUTES = 90;
const MIN_BAR_PCT = 0.5;

/**
 * Bar para un vuelo. Maneja overnight (desde ayer / hasta mañana).
 * Devuelve null si ni eta ni etd estan presentes (o el bar caeria fuera del rango).
 */
export function computeBarBounds(
  flight: Pick<Flight, "eta" | "etd" | "arrivalDate" | "departureDate">,
  viewDayShort: string, // "DD/MM"
  range: TimelineRange = OPS_RANGE,
): BarBounds | null {
  const etaMin = parseHHMM(flight.eta);
  const etdMin = parseHHMM(flight.etd);
  if (etaMin === null && etdMin === null) return null;

  const arrToday = !flight.arrivalDate || flight.arrivalDate.slice(0, 5) === viewDayShort;
  const depToday = !flight.departureDate || flight.departureDate.slice(0, 5) === viewDayShort;

  let startMinAbs: number | null = null;
  let endMinAbs: number | null = null;
  let kind: BarBounds["kind"] = "stay";

  if (etaMin !== null && etdMin !== null && arrToday && depToday) {
    startMinAbs = etaMin;
    endMinAbs = etdMin;
    if (endMinAbs < startMinAbs) endMinAbs = range.endMin; // proteccion
  } else if (!arrToday && depToday && etdMin !== null) {
    startMinAbs = range.startMin;
    endMinAbs = etdMin;
  } else if (arrToday && !depToday && etaMin !== null) {
    startMinAbs = etaMin;
    endMinAbs = range.endMin;
  } else if (arrToday && etaMin !== null) {
    startMinAbs = etaMin;
    endMinAbs = etaMin + ARRIVAL_ONLY_BAR_MINUTES;
    kind = "arrival-only";
  } else if (depToday && etdMin !== null) {
    startMinAbs = etdMin - DEPARTURE_ONLY_BAR_MINUTES;
    endMinAbs = etdMin;
    kind = "departure-only";
  } else {
    return null;
  }

  // Clip al rango visible
  const clippedStart = Math.max(startMinAbs, range.startMin);
  const clippedEnd = Math.min(endMinAbs, range.endMin);
  if (clippedEnd <= clippedStart + 1) return null; // fuera de rango

  const startPct = minToPct(clippedStart, range);
  let endPct = minToPct(clippedEnd, range);
  if (endPct - startPct < MIN_BAR_PCT) endPct = startPct + MIN_BAR_PCT;

  return { startPct, endPct, kind };
}

export type Pip = {
  pct: number;
  letter: "F" | "C" | "T" | "S";
  state: "ok" | "req" | "no";
  label: string;
};

/**
 * Pips para fuel (F), toilet (T) y servicios (C catering, S extras).
 * Posiciones derivadas de los timestamps cuando estan; si no, distribuidos
 * uniformemente sobre el bar. Filtra los que caigan fuera del rango.
 */
export function flightPips(
  flight: Pick<Flight, "fuelState" | "fuelRequestedAt" | "fuelServedAt" | "toiletState" | "toiletRequestedAt" | "toiletCompletedAt">,
  services: Pick<Service, "type" | "state" | "arrivedAt" | "deliveredAt">[],
  bar: BarBounds,
  range: TimelineRange = OPS_RANGE,
): Pip[] {
  const pips: Pip[] = [];

  // Helper to bucket timestamps into a single pip per service kind
  const addTimePip = (raw: string | null, fallbackPct: number, letter: Pip["letter"], state: Pip["state"], label: string) => {
    const m = parseHHMM(raw);
    const pct = m !== null ? minToPct(m, range) : fallbackPct;
    if (pct < 0 || pct > 100) return;
    pips.push({ pct, letter, state, label });
  };

  // Distribute fallback positions uniformly across the bar
  const buckets = countActiveServices(flight, services);
  let bucketIdx = 0;
  const nextFallback = () => {
    bucketIdx++;
    return bar.startPct + (bar.endPct - bar.startPct) * (bucketIdx / (buckets + 1));
  };

  // FUEL
  if (flight.fuelState !== "NOT_REQUESTED") {
    const ts = flight.fuelState === "SERVED" ? flight.fuelServedAt : flight.fuelRequestedAt;
    const state: Pip["state"] = flight.fuelState === "SERVED" ? "ok" : "req";
    addTimePip(ts, nextFallback(), "F", state, `Fuel ${flight.fuelState}`);
  }

  // TOILET
  if (flight.toiletState !== "NOT_REQUESTED") {
    const ts = flight.toiletState === "COMPLETED" ? flight.toiletCompletedAt : flight.toiletRequestedAt;
    const state: Pip["state"] = flight.toiletState === "COMPLETED" ? "ok" : "req";
    addTimePip(ts, nextFallback(), "T", state, `Toilet ${flight.toiletState}`);
  }

  // SERVICES (catering = C, otros = S)
  for (const s of services) {
    const letter: Pip["letter"] = s.type === "CATERING" ? "C" : "S";
    const state: Pip["state"] = s.state === "DELIVERED" ? "ok" : s.state === "ARRIVED" ? "req" : "no";
    const ts = s.state === "DELIVERED" ? s.deliveredAt : s.arrivedAt;
    addTimePip(ts, nextFallback(), letter, state, `${s.type} ${s.state}`);
  }

  return pips;
}

function countActiveServices(
  flight: Pick<Flight, "fuelState" | "toiletState">,
  services: { type: string }[],
): number {
  let n = 0;
  if (flight.fuelState !== "NOT_REQUESTED") n++;
  if (flight.toiletState !== "NOT_REQUESTED") n++;
  n += services.length;
  return n;
}

/** Detecta si el callsign es comercial (codigos ICAO de aerolinea conocidos)
 * o privado (matricula como callsign). Usado por el filtro de pills. */
const COMMERCIAL_PREFIXES = new Set([
  "VLG", "RYR", "EJU", "EZY", "IBE", "IBS", "AEA", "BAW", "DLH", "AFR", "KLM",
  "SAS", "FIN", "AUA", "SWR", "TAP", "EWG", "ITY", "ROT", "TUI", "TFL", "WZZ",
]);

export function isCommercialCallsign(callsign: string | null | undefined): boolean {
  if (!callsign) return false;
  const head = callsign.slice(0, 3).toUpperCase();
  return COMMERCIAL_PREFIXES.has(head);
}

/** Fases de turnaround para colorear los segmentos del bar en vuelos activos. */
export type BarSegment = "land" | "turn-parked" | "turn-svc" | "turn-board" | "depart";

/** Determina los segmentos visibles del bar segun el estado del vuelo. */
export function barSegments(state: string, paxDepBoarded: boolean): BarSegment[] {
  switch (state) {
    case "ARRIVING":
    case "ON_BLOCKS":
      return ["turn-parked"];
    case "PARKED":
      return ["turn-parked"];
    case "DEPARTING":
    case "TURNAROUND":
      return paxDepBoarded ? ["turn-svc", "turn-board"] : ["turn-svc"];
    case "BOARDING":
      return ["turn-board"];
    default:
      return [];
  }
}
