// Shared "pending flight" predicate.
//
// A single definition of "este vuelo tiene algo operativamente pendiente"
// consumed by the `Solo pendientes` filter toggle and the
// `PendingServicesPanel` counters, so the badge and the filter never disagree.
//
// Mantén esta función pura: no toques `Date.now()`, ni dependencias externas;
// recibe el `FlightLike` y decide. Si el vuelo ya está despachado
// (`OFF_BLOCKS` o el legacy `DISPATCHED`) nunca cuenta como pendiente.

import { normalizeFlightState } from "@/types";
import type { Flight, Service } from "@/types/compat";

type FlightLike = Pick<
  Flight,
  | "state"
  | "fuelState"
  | "toiletState"
  | "paxArrTransportState"
  | "paxArrTransportType"
  | "paxDepTransportState"
  | "paxDepTransportType"
> & {
  services?: Pick<Service, "state">[];
};

/**
 * True when the flight has any operationally-pending service.
 * Used by the "Solo pendientes" filter and the PendingServicesPanel
 * counters so both stay in sync.
 *
 * Already-departed flights (OFF_BLOCKS / DISPATCHED) are never pending.
 */
export function isFlightPending(flight: FlightLike): boolean {
  const state = normalizeFlightState(flight.state);
  if (state === "OFF_BLOCKS") return false;

  // 1. Some service is PENDING or ARRIVED (not DELIVERED, not CANCELLED).
  const services = flight.services ?? [];
  if (services.some((s) => s.state === "PENDING" || s.state === "ARRIVED")) {
    return true;
  }

  // 2. Fuel requested but not yet served.
  if (flight.fuelState === "REQUESTED") return true;

  // 3. ON_BLOCKS and fuel not yet requested — operativamente cuenta.
  if (flight.fuelState === "NOT_REQUESTED" && state === "ON_BLOCKS") return true;

  // 4. Toilet requested but not yet completed.
  if (flight.toiletState === "REQUESTED") return true;

  // 5. Arrival transport PENDING (only when a transport type was actually set).
  if (
    flight.paxArrTransportState === "PENDING" &&
    flight.paxArrTransportType !== "UNDEFINED"
  ) {
    return true;
  }

  // 6. Departure transport PENDING (only when a transport type was actually set).
  if (
    flight.paxDepTransportState === "PENDING" &&
    flight.paxDepTransportType !== "UNDEFINED"
  ) {
    return true;
  }

  return false;
}
