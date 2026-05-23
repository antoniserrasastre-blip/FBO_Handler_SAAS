// Adapter: build the legacy `Flight` shape from a v2 Visit + Movements.
//
// UI components (FlightCard, dia/, timeline/, dashboards) consume this shape.
// Endpoints under /api/flights/* read v2 entities and project them through
// `toFlightView()` before responding.
//
// When mutating direction-specific fields, callers use `resolveMovement()`
// to find the right Movement row (ARRIVAL vs DEPARTURE) and map the legacy
// field name to its v2 location.

import type { FlightView, FlightViewService, FlightViewLostItem, FlightViewCrewItem } from "@/types/v2";

type AnyRecord = Record<string, unknown>;

interface VisitWithMovements {
  id: string;
  aircraftId: string;
  operatorId: string | null;
  palmaDay: Date;
  type: string | null;
  arrivalDate: Date | null;
  departureDate: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  aircraft?: { registration: string; aircraftType: string | null };
  movements: AnyRecord[];
  services?: unknown[];
  lostItems?: unknown[];
  crewItems?: unknown[];
}

function pick<T extends AnyRecord>(rows: T[], dir: "ARRIVAL" | "DEPARTURE"): T | null {
  return rows.find((r) => r.direction === dir) || null;
}

function dateToDdMm(d: Date | string | null): string | null {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

function combineInstant(date: Date | string | null | undefined, hhmm: string | null | undefined): Date | null {
  if (!date || !hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const base = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(base.getTime())) return null;
  const out = new Date(base.getTime());
  out.setUTCHours(parseInt(m[1], 10), parseInt(m[2], 10), 0, 0);
  return out;
}

export function toFlightView(visit: VisitWithMovements): FlightView {
  const arr = pick(visit.movements as AnyRecord[], "ARRIVAL");
  const dep = pick(visit.movements as AnyRecord[], "DEPARTURE");

  // Prefer DEPARTURE for "primary" fields like callsign/state, fall back to ARRIVAL.
  // This matches the old Flight model where a single row carried both legs and
  // the callsign typically referred to the departure leg in UI displays.
  const primary = dep || arr;
  const isOvernight = visit.type === "OVERNIGHT";

  // Pick the freshest live snapshot across both legs.
  const liveSource = (() => {
    const arrSeen = (arr?.liveLastSeenAt as Date | string | null | undefined) ?? null;
    const depSeen = (dep?.liveLastSeenAt as Date | string | null | undefined) ?? null;
    if (!arrSeen && !depSeen) return null;
    if (!arrSeen) return dep;
    if (!depSeen) return arr;
    const arrT = new Date(arrSeen).getTime();
    const depT = new Date(depSeen).getTime();
    return depT >= arrT ? dep : arr;
  })();

  return {
    id: visit.id,
    visitId: visit.id,
    arrivalMovementId: (arr?.id as string) || null,
    departureMovementId: (dep?.id as string) || null,

    daySheetId: visit.palmaDay.toISOString(),

    callsign: (primary?.callsign as string) || "",
    arrivalCallsign: (arr?.callsign as string) || "",
    departureCallsign: (dep?.callsign as string) || "",
    registration: visit.aircraft?.registration || "",
    aircraftType: visit.aircraft?.aircraftType || "",

    origin: (arr?.origin as string | null) ?? null,
    eta: (arr?.eta as string | null) ?? null,
    arrivalDate: dateToDdMm((visit.arrivalDate ?? (arr?.scheduledDate as Date | null)) || null),

    destination: (dep?.destination as string | null) ?? null,
    etd: (dep?.etd as string | null) ?? null,
    departureDate: dateToDdMm((visit.departureDate ?? (dep?.scheduledDate as Date | null)) || null),
    arrivalInstant: combineInstant(
      (visit.arrivalDate ?? (arr?.scheduledDate as Date | null)) || null,
      (arr?.eta as string | null) ?? null
    ),
    departureInstant: combineInstant(
      (visit.departureDate ?? (dep?.scheduledDate as Date | null)) || null,
      (dep?.etd as string | null) ?? null
    ),

    parking: (primary?.parking as string | null) ?? null,
    tobt: (dep?.tobt as string | null) ?? null,
    state: (primary?.state as string) ?? "EXPECTED",
    isOvernight,

    crewArrival: (arr?.crewCount as number) ?? 0,
    crewArrivalReal: (arr?.crewCountReal as number | null) ?? null,
    paxArrival: (arr?.paxCount as number) ?? 0,
    paxArrivalReal: (arr?.paxCountReal as number | null) ?? null,
    crewDeparture: (dep?.crewCount as number) ?? 0,
    crewDepartureReal: (dep?.crewCountReal as number | null) ?? null,
    paxDeparture: (dep?.paxCount as number) ?? 0,
    paxDepartureReal: (dep?.paxCountReal as number | null) ?? null,

    paxArrBagsChecked: (arr?.bagsChecked as number) ?? 0,
    paxArrBagsCabin: (arr?.bagsCabin as number) ?? 0,
    paxArrBagsState: (arr?.bagsState as string) ?? "IN_AIRCRAFT",
    paxArrTransportType: (arr?.transportType as string) ?? "UNDEFINED",
    paxArrTransportState: (arr?.transportState as string) ?? "PENDING",
    paxArrState: (arr?.paxState as string) ?? "IN_AIRCRAFT",

    paxDepBagsChecked: (dep?.bagsChecked as number) ?? 0,
    paxDepBagsCabin: (dep?.bagsCabin as number) ?? 0,
    paxDepBagsState: (dep?.bagsState as string) ?? "NOT_ARRIVED",
    paxDepTransportType: (dep?.transportType as string) ?? "UNDEFINED",
    paxDepTransportState: (dep?.transportState as string) ?? "PENDING",
    paxDepState: (dep?.paxState as string) ?? "NOT_ARRIVED",

    crewArrLocation: (arr?.crewLocation as string) ?? "IN_AIRCRAFT",
    crewDepLocation: (dep?.crewLocation as string) ?? "IN_AIRCRAFT",

    fuelState: (dep?.fuelState as string) ?? "NOT_REQUESTED",
    fuelRequestedAt: (dep?.fuelRequestedAt as string | null) ?? null,
    fuelServedAt: (dep?.fuelServedAt as string | null) ?? null,
    toiletState: (dep?.toiletState as string) ?? "NOT_REQUESTED",
    toiletRequestedAt: (dep?.toiletRequestedAt as string | null) ?? null,
    toiletCompletedAt: (dep?.toiletCompletedAt as string | null) ?? null,

    linkedFlightId: null,                   // Pernoctas: encoded by Visit.type=OVERNIGHT
    notes: visit.notes,

    rqstNumber: (dep?.rqstNumber as string | null) ?? (arr?.rqstNumber as string | null) ?? null,
    flightCategory: ((dep?.flightCategory as string) || (arr?.flightCategory as string) || "COMMERCIAL") as FlightView["flightCategory"],
    modifiedFlag: Boolean(dep?.modifiedFlag || arr?.modifiedFlag),
    petCount: (dep?.petCount as number) ?? (arr?.petCount as number) ?? 0,

    services: visit.services as FlightViewService[] | undefined,
    lostItems: visit.lostItems as FlightViewLostItem[] | undefined,
    crewItems: visit.crewItems as FlightViewCrewItem[] | undefined,
    ata: (arr?.ata as string | null) ?? null,
    atd: (dep?.atd as string | null) ?? null,
    livePhase: (liveSource?.livePhase as string | null) ?? null,
    liveLastSeenAt: (liveSource?.liveLastSeenAt as Date | string | null) ?? null,
    liveOnGround: (liveSource?.liveOnGround as boolean | null) ?? null,
    liveAltitudeM: (liveSource?.liveAltitudeM as number | null) ?? null,
    liveVelocityMs: (liveSource?.liveVelocityMs as number | null) ?? null,

    createdAt: visit.createdAt,
    updatedAt: visit.updatedAt,
  };
}

// ----- Field routing for legacy PATCH /api/flights/[id] -----

/**
 * Map a legacy `Flight` field name to (movementDirection, v2 field name).
 * Returns null for fields that live on Visit itself (notes, isOvernight)
 * or fields that no longer exist (linkedFlightId).
 */
export function routeFieldToMovement(
  legacyField: string
): { direction: "ARRIVAL" | "DEPARTURE"; field: string } | { onVisit: string } | null {
  // Visit-level
  if (legacyField === "notes") return { onVisit: "notes" };
  if (legacyField === "isOvernight") return { onVisit: "__isOvernight" };
  if (legacyField === "registration") return { onVisit: "__registration" };
  if (legacyField === "aircraftType") return { onVisit: "__aircraftType" };
  if (legacyField === "linkedFlightId") return null;

  // ARRIVAL leg
  const arrivalMap: Record<string, string> = {
    origin: "origin",
    eta: "eta",
    ata: "ata",
    arrivalDate: "__scheduledDate",
    crewArrival: "crewCount",
    crewArrivalReal: "crewCountReal",
    paxArrival: "paxCount",
    paxArrivalReal: "paxCountReal",
    paxArrBagsChecked: "bagsChecked",
    paxArrBagsCabin: "bagsCabin",
    paxArrBagsState: "bagsState",
    paxArrTransportType: "transportType",
    paxArrTransportState: "transportState",
    paxArrState: "paxState",
    crewArrLocation: "crewLocation",
  };
  if (arrivalMap[legacyField]) return { direction: "ARRIVAL", field: arrivalMap[legacyField] };

  // DEPARTURE leg
  const departureMap: Record<string, string> = {
    destination: "destination",
    etd: "etd",
    atd: "atd",
    departureDate: "__scheduledDate",
    callsign: "callsign",
    parking: "parking",
    tobt: "tobt",
    state: "state",
    crewDeparture: "crewCount",
    crewDepartureReal: "crewCountReal",
    paxDeparture: "paxCount",
    paxDepartureReal: "paxCountReal",
    paxDepBagsChecked: "bagsChecked",
    paxDepBagsCabin: "bagsCabin",
    paxDepBagsState: "bagsState",
    paxDepTransportType: "transportType",
    paxDepTransportState: "transportState",
    paxDepState: "paxState",
    crewDepLocation: "crewLocation",
    fuelState: "fuelState",
    fuelRequestedAt: "fuelRequestedAt",
    fuelServedAt: "fuelServedAt",
    toiletState: "toiletState",
    toiletRequestedAt: "toiletRequestedAt",
    toiletCompletedAt: "toiletCompletedAt",
  };
  if (departureMap[legacyField]) return { direction: "DEPARTURE", field: departureMap[legacyField] };

  return null;
}
