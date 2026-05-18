// Flight urgency / phase clock helpers.
//
// Decide qué reloj (ETA / ETD) se usa para alertas según el estado del vuelo,
// y si la fase de llegada está cerrada (fuel + toilet + servicios ARRIVAL).
//
// v2: signatures use structural types instead of Prisma's `Flight` / `Service`
// so callers can pass FlightView or v2 Movements interchangeably.

import { normalizeFlightState, type FlightState } from "@/types";

export type ClockKind = "ETA" | "ETD" | null;

export interface FlightClock {
  kind: ClockKind;
  ref: string | null; // HH:MM
}

export interface FlightLike {
  state: string;
  eta?: string | null;
  etd?: string | null;
  ata?: string | null;
  atd?: string | null;
  isOvernight?: boolean | null;
  fuelState?: string | null;
  toiletState?: string | null;
  paxArrState?: string | null;
  paxDepState?: string | null;
}

export interface ServiceLike {
  phase?: string | null;       // legacy field name
  direction?: string | null;   // v2 field name — accepted as alias
  state: string;
}

function servicePhase(s: ServiceLike): string {
  return s.phase || s.direction || "DEPARTURE";
}

/**
 * Devuelve el reloj de referencia para alertas según la fase del vuelo.
 */
export function getFlightClock(flight: Pick<FlightLike, "state" | "eta" | "etd">): FlightClock {
  const state = normalizeFlightState(flight.state);
  switch (state) {
    case "EXPECTED":
      return { kind: "ETA", ref: flight.eta ?? null };
    case "TURNAROUND":
    case "BOARDING":
      return { kind: "ETD", ref: flight.etd ?? null };
    case "ON_BLOCKS":
    case "PARKED":
      return { kind: "ETD", ref: flight.etd ?? null };
    case "OFF_BLOCKS":
    default:
      return { kind: null, ref: null };
  }
}

/**
 * Comprueba si la fase de llegada está cerrada.
 */
export function isArrivalComplete(
  flight: Pick<FlightLike, "fuelState" | "toiletState">,
  services: ServiceLike[],
): boolean {
  if (flight.fuelState !== "SERVED") return false;
  if (flight.toiletState !== "COMPLETED") return false;
  const arrivalServices = services.filter((s) => {
    const p = servicePhase(s);
    return p === "ARRIVAL" || p === "BOTH";
  });
  return arrivalServices.every((s) => s.state === "DELIVERED");
}

/**
 * Comprueba si la fase de salida está lista.
 */
export function isDepartureReady(services: ServiceLike[]): boolean {
  const dep = services.filter((s) => {
    const p = servicePhase(s);
    return p === "DEPARTURE" || p === "BOTH";
  });
  if (dep.length === 0) return true;
  return dep.every((s) => s.state === "DELIVERED");
}

/**
 * Sugerir transición automática.
 */
export function suggestNextState(
  flight: FlightLike,
  services: ServiceLike[],
  nowMinutes?: number,
): FlightState | null {
  const state = normalizeFlightState(flight.state);
  const arrivalDone = isArrivalComplete(flight, services);

  // ATD fijado ⇒ el avión se ha ido, salta directo a OFF_BLOCKS sea cual sea
  // el estado intermedio. Permite que poner ATD en /dia cierre el ciclo.
  if (flight.atd && state !== "OFF_BLOCKS") return "OFF_BLOCKS";

  switch (state) {
    case "EXPECTED": {
      const arrivalTouched =
        Boolean(flight.ata) ||
        (flight.fuelState && flight.fuelState !== "NOT_REQUESTED") ||
        (flight.toiletState && flight.toiletState !== "NOT_REQUESTED") ||
        (flight.paxArrState && flight.paxArrState !== "IN_AIRCRAFT");
      if (arrivalTouched) return "ON_BLOCKS";
      return null;
    }
    case "ON_BLOCKS": {
      if (!arrivalDone) return null;
      return flight.isOvernight ? "PARKED" : "TURNAROUND";
    }
    case "PARKED": {
      if (!flight.etd) return null;
      const minutesUntil = minutesUntil_HHMM(flight.etd, nowMinutes);
      if (minutesUntil !== null && minutesUntil <= 90 && minutesUntil > -60) return "TURNAROUND";
      return null;
    }
    case "TURNAROUND": {
      if (flight.paxDepState === "BOARDED") return "BOARDING";
      return null;
    }
    default:
      return null;
  }
}

export function minutesUntil_HHMM(hhmm: string, nowMinutes?: number): number | null {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const target = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  const now = nowMinutes ?? new Date().getUTCHours() * 60 + new Date().getUTCMinutes();
  return target - now;
}
