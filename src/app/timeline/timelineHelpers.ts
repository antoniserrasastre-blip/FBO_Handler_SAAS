// Helpers para la vista /timeline (eje horizontal deslizante).
// Modelo de coordenadas: timestamps absolutos en ms (epoch). El eje se centra
// alrededor de un instante configurable (por defecto NOW Zulu) con una ventana
// de N horas — el usuario puede desplazarse en el tiempo con la rueda del
// raton.

import type { Flight, Service } from "@/types/compat";

export type TimelineRange = { startMs: number; endMs: number };

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

/** Construye un rango [center - window/2, center + window/2]. */
export function rangeFromCenter(centerMs: number, windowMs: number): TimelineRange {
  const half = windowMs / 2;
  return { startMs: centerMs - half, endMs: centerMs + half };
}

/** Convierte ms absolutos a porcentaje 0..100 dentro de la ventana visible. */
export function msToPct(ms: number, range: TimelineRange): number {
  const total = range.endMs - range.startMs;
  if (total <= 0) return 0;
  return ((ms - range.startMs) / total) * 100;
}

/** Posicion NOW como porcentaje del rango. */
export function nowPctInRange(now: Date, range: TimelineRange): number {
  return msToPct(now.getTime(), range);
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

function toMs(instant: Date | string | null | undefined): number | null {
  if (instant === null || instant === undefined) return null;
  const d = instant instanceof Date ? instant : new Date(instant);
  const t = d.getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Resuelve un HH:MM Zulu sobre la fecha (UTC) de `baseInstant` y devuelve los
 * ms absolutos. Sirve para situar pips de servicio en el eje cuando el campo
 * de la BD es solo HH:MM y necesitamos anclarlo a un dia concreto.
 */
export function resolveHhmmMs(
  hhmm: string | null | undefined,
  baseInstant: Date | string | null | undefined,
): number | null {
  const m = parseHHMM(hhmm);
  if (m === null) return null;
  const baseMs = toMs(baseInstant);
  if (baseMs === null) return null;
  const d = new Date(baseMs);
  d.setUTCHours(Math.floor(m / 60), m % 60, 0, 0);
  return d.getTime();
}

export type BarBounds = {
  startPct: number;
  endPct: number;
  startMs: number;
  endMs: number;
  kind: "stay" | "arrival-only" | "departure-only";
};

const ARRIVAL_ONLY_BAR_MS = 90 * 60 * 1000;
const DEPARTURE_ONLY_BAR_MS = 90 * 60 * 1000;
const MIN_BAR_PCT = 0.4;

/**
 * Bar para un vuelo usando timestamps absolutos. Si solo hay llegada o salida,
 * pinta una barra corta de 90 min anclada al evento. Devuelve null si la barra
 * no intersecta el rango visible.
 */
export function computeBarBounds(
  flight: { arrivalInstant: Date | string | null; departureInstant: Date | string | null },
  range: TimelineRange,
): BarBounds | null {
  const arrMs = toMs(flight.arrivalInstant);
  const depMs = toMs(flight.departureInstant);
  if (arrMs === null && depMs === null) return null;

  let startMs: number;
  let endMs: number;
  let kind: BarBounds["kind"] = "stay";

  if (arrMs !== null && depMs !== null) {
    startMs = arrMs;
    endMs = depMs < arrMs ? arrMs + HOUR_MS : depMs;
  } else if (arrMs !== null) {
    startMs = arrMs;
    endMs = arrMs + ARRIVAL_ONLY_BAR_MS;
    kind = "arrival-only";
  } else {
    startMs = depMs! - DEPARTURE_ONLY_BAR_MS;
    endMs = depMs!;
    kind = "departure-only";
  }

  const clippedStart = Math.max(startMs, range.startMs);
  const clippedEnd = Math.min(endMs, range.endMs);
  if (clippedEnd <= clippedStart) return null;

  const startPct = msToPct(clippedStart, range);
  let endPct = msToPct(clippedEnd, range);
  if (endPct - startPct < MIN_BAR_PCT) endPct = startPct + MIN_BAR_PCT;

  return { startPct, endPct, startMs, endMs, kind };
}

export type Pip = {
  pct: number;
  letter: "F" | "C" | "T" | "S";
  state: "ok" | "req" | "no";
  label: string;
};

/**
 * Pips para fuel (F), toilet (T) y servicios (C/S). Los HH:MM se anclan al
 * dia de `arrivalInstant` / `departureInstant`; si no hay timestamp se reparten
 * uniformemente a lo largo del bar.
 */
export function flightPips(
  flight: Pick<
    Flight,
    | "fuelState"
    | "fuelRequestedAt"
    | "fuelServedAt"
    | "toiletState"
    | "toiletRequestedAt"
    | "toiletCompletedAt"
    | "arrivalInstant"
    | "departureInstant"
  >,
  services: Pick<Service, "type" | "state" | "arrivedAt" | "deliveredAt">[],
  bar: BarBounds,
  range: TimelineRange,
): Pip[] {
  const pips: Pip[] = [];
  const anchor = flight.arrivalInstant ?? flight.departureInstant ?? null;

  const buckets = countActiveServices(flight, services);
  let bucketIdx = 0;
  const nextFallback = () => {
    bucketIdx++;
    return bar.startPct + (bar.endPct - bar.startPct) * (bucketIdx / (buckets + 1));
  };

  const addTimePip = (
    raw: string | null,
    fallbackPct: number,
    letter: Pip["letter"],
    state: Pip["state"],
    label: string,
  ) => {
    const ms = resolveHhmmMs(raw, anchor);
    const pct = ms !== null ? msToPct(ms, range) : fallbackPct;
    if (pct < 0 || pct > 100) return;
    pips.push({ pct, letter, state, label });
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

/**
 * Genera ticks horarios para una ventana. Cada tick corresponde a una hora
 * Zulu redonda dentro del rango. Marca `isMidnight` para que el caller pueda
 * dibujar separadores y etiquetas de dia.
 */
export type RulerTick = { ms: number; hour: number; isMidnight: boolean };

export function rulerTicks(range: TimelineRange, stepHours = 1): RulerTick[] {
  const out: RulerTick[] = [];
  const start = new Date(range.startMs);
  start.setUTCMinutes(0, 0, 0);
  // Alinea al multiplo de stepHours en UTC
  start.setUTCHours(Math.ceil(start.getUTCHours() / stepHours) * stepHours);
  if (start.getTime() < range.startMs) start.setTime(start.getTime() + stepHours * HOUR_MS);
  for (let t = start.getTime(); t <= range.endMs; t += stepHours * HOUR_MS) {
    const d = new Date(t);
    out.push({ ms: t, hour: d.getUTCHours(), isMidnight: d.getUTCHours() === 0 });
  }
  return out;
}

/**
 * Devuelve los palmaDay (medianoche UTC alineada a la fecha local de Palma)
 * que la ventana cubre. Se usa para saber que dias hay que descargar.
 */
export function palmaDaysInRange(range: TimelineRange): string[] {
  const out: string[] = [];
  // Conservador: anadimos 1 dia de margen a cada lado para cubrir vuelos
  // overnight cuyo palmaDay puede estar fuera de la ventana pero su instant
  // dentro.
  const from = new Date(range.startMs - DAY_MS);
  const to = new Date(range.endMs + DAY_MS);
  for (let t = from.getTime(); t <= to.getTime(); t += DAY_MS) {
    const d = new Date(t);
    const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    if (!out.includes(iso)) out.push(iso);
  }
  return out;
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
