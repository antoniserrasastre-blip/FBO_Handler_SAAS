// Flight urgency / phase clock helpers.
//
// Decide qué reloj (ETA / ETD) se usa para alertas según el estado del vuelo,
// y si la fase de llegada está cerrada (fuel + toilet + servicios ARRIVAL).

import type { Flight, Service } from "@prisma/client";
import { normalizeFlightState, type FlightState } from "@/types";

export type ClockKind = "ETA" | "ETD" | null;

export interface FlightClock {
  kind: ClockKind;
  ref: string | null; // HH:MM
}

/**
 * Devuelve el reloj de referencia para alertas según la fase del vuelo.
 * - EXPECTED → ETA
 * - ON_BLOCKS → ETD si está cerca (<3h), si no nada
 * - PARKED → ETD si está cerca (<3h), si no nada
 * - TURNAROUND / BOARDING → ETD
 * - OFF_BLOCKS → ninguno
 */
export function getFlightClock(flight: Pick<Flight, "state" | "eta" | "etd">): FlightClock {
  const state = normalizeFlightState(flight.state);
  switch (state) {
    case "EXPECTED":
      return { kind: "ETA", ref: flight.eta ?? null };
    case "ARRIVING":
    case "PARKED":
    case "DEPARTING":
      return { kind: "ETD", ref: flight.etd ?? null };
    case "DEPARTED":
    default:
      return { kind: null, ref: null };
  }
}

/**
 * Comprueba si la fase de llegada está cerrada.
 * Fuel SERVED, Toilet COMPLETED y todos los servicios ARRIVAL/BOTH en DELIVERED.
 */
export function isArrivalComplete(
  flight: Pick<Flight, "fuelState" | "toiletState">,
  services: Pick<Service, "phase" | "state">[],
): boolean {
  if (flight.fuelState !== "SERVED") return false;
  if (flight.toiletState !== "COMPLETED") return false;
  const arrivalServices = services.filter(s => s.phase === "ARRIVAL" || s.phase === "BOTH");
  return arrivalServices.every(s => s.state === "DELIVERED");
}

/**
 * Comprueba si la fase de salida está lista (todos los servicios DEPARTURE/BOTH entregados).
 */
export function isDepartureReady(services: Pick<Service, "phase" | "state">[]): boolean {
  const dep = services.filter(s => s.phase === "DEPARTURE" || s.phase === "BOTH");
  if (dep.length === 0) return true;
  return dep.every(s => s.state === "DELIVERED");
}

/**
 * Sugerir transición automática a partir del estado actual y los datos del vuelo.
 * Devuelve null si no se debe cambiar.
 *
 * Reglas (5 estados):
 *   EXPECTED  + fuel/toilet/pax tocados → ARRIVING
 *   ARRIVING  + arrival completo + isOvernight → PARKED
 *   ARRIVING  + arrival completo + !isOvernight → DEPARTING
 *   PARKED    + ETD <90min → DEPARTING
 *   DEPARTING + (sin transicion auto a DEPARTED — manual cuando off-blocks)
 *
 * Nota: el antiguo BOARDING ya no es estado top-level; el sub-estado
 * "esta embarcando" se ve via paxDepState=BOARDED como badge en el UI.
 */
export function suggestNextState(
  flight: Pick<
    Flight,
    | "state"
    | "etd"
    | "isOvernight"
    | "fuelState"
    | "toiletState"
    | "paxArrState"
    | "paxDepState"
  >,
  services: Pick<Service, "phase" | "state">[],
  nowMinutes?: number,
): FlightState | null {
  const state = normalizeFlightState(flight.state);
  const arrivalDone = isArrivalComplete(flight, services);

  switch (state) {
    case "EXPECTED": {
      const arrivalTouched =
        flight.fuelState !== "NOT_REQUESTED" ||
        flight.toiletState !== "NOT_REQUESTED" ||
        flight.paxArrState !== "IN_AIRCRAFT";
      if (arrivalTouched) return "ARRIVING";
      return null;
    }
    case "ARRIVING": {
      if (!arrivalDone) return null;
      return flight.isOvernight ? "PARKED" : "DEPARTING";
    }
    case "PARKED": {
      if (!flight.etd) return null;
      const minutesUntil = minutesUntil_HHMM(flight.etd, nowMinutes);
      if (minutesUntil !== null && minutesUntil <= 90 && minutesUntil > -60) return "DEPARTING";
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
