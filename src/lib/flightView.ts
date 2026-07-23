// Adapter: build the legacy `Flight` shape from a v2 Visit + Movements.
//
// UI components (FlightCard, dia/, timeline/, dashboards) consume this shape.
// Endpoints under /api/flights/* read v2 entities and project them through
// `toFlightView()` before responding.
//
// When mutating direction-specific fields, callers use `resolveMovement()`
// to find the right Movement row (ARRIVAL vs DEPARTURE) and map the legacy
// field name to its v2 location.
//
// READ-MERGE (transition period)
// --------------------------------
// `mergeCrewItemsIntoServices` is applied inside `toFlightView()` so the
// services list is the SINGLE unified source for the UI.  For every
// CrewItem whose mirror Service (id = "ci_<crewItemId>") does NOT yet exist
// in the Service table (migration not run, or dual-write missed), the
// function projects the CrewItem in memory via `crewItemToService()`.
// If the mirror Service IS already present it wins (the real DB row takes
// precedence).  The result: each item appears exactly once, in stable order
// (real services first, then unmigrated crew items appended).

import type { FlightView, FlightViewService, FlightViewLostItem, FlightViewCrewItem, FlightViewTask, FlightViewEventLogWithUser } from "@/types/v2";
import { FLIGHT_STATES, NO_SHOW_STATE, normalizeFlightState } from "@/types";
import { resolveAirport } from "./airportsFallback";
import { crewItemToService, crewItemServiceId, type CrewItemRecord } from "./crewItemMigration";

type AnyRecord = Record<string, unknown>;

// The visit's single lifecycle state (EXPECTED→ON_BLOCKS→PARKED→TURNAROUND→
// BOARDING→OFF_BLOCKS) spans BOTH legs, but each Movement only carries its own
// leg's progress: an overnight's DEPARTURE starts at EXPECTED while its ARRIVAL
// already sits at PARKED. Taking the DEPARTURE state verbatim would render a
// parked overnight as "Esperando llegada" and stall the auto-transition.
// Compose the visit state as the MOST ADVANCED point reached across both legs.
export function mostAdvancedState(...states: (string | null | undefined)[]): string {
  let best = -1;
  let sawNoShow = false;
  for (const s of states) {
    if (!s) continue;
    // NO_SHOW es terminal, no parte de la progresión: no entra en el ranking.
    if (s === NO_SHOW_STATE) {
      sawNoShow = true;
      continue;
    }
    const idx = FLIGHT_STATES.indexOf(normalizeFlightState(s));
    if (idx > best) best = idx;
  }
  // ARRIVAL en NO_SHOW con la otra pata sin progreso operativo (EXPECTED o
  // ausente) ⇒ el visit entero nunca ocurrió: proyectamos NO_SHOW.
  if (sawNoShow && best <= 0) return NO_SHOW_STATE;
  return best >= 0 ? FLIGHT_STATES[best] : "EXPECTED";
}

interface VisitWithMovements {
  id: string;
  aircraftId: string;
  operatorId: string | null;
  palmaDay: Date;
  type: string | null;
  arrivalDate: Date | null;
  departureDate: Date | null;
  notes: string | null;
  assignedToId?: string | null;
  assignedTo?: { id: string; name: string } | null;
  createdAt: Date;
  updatedAt: Date;
  aircraft?: { registration: string; aircraftType: string | null };
  movements: AnyRecord[];
  services?: unknown[];
  lostItems?: unknown[];
  crewItems?: unknown[];
  eventLogs?: unknown[];
}

function pick<T extends AnyRecord>(rows: T[], dir: "ARRIVAL" | "DEPARTURE"): T | null {
  return rows.find((r) => r.direction === dir) || null;
}

function collectTasks(arr: AnyRecord | null, dep: AnyRecord | null): FlightViewTask[] {
  const out: FlightViewTask[] = [];
  for (const [mov, direction] of [[arr, "ARRIVAL"], [dep, "DEPARTURE"]] as const) {
    const rows = (mov?.tasks as AnyRecord[] | undefined) ?? [];
    for (const t of rows) {
      out.push({
        id: t.id as string,
        movementId: t.movementId as string | undefined,
        type: t.type as string,
        state: t.state as string,
        direction,
        doneAt: (t.doneAt as Date | string | null) ?? null,
      });
    }
  }
  return out;
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

// ---------------------------------------------------------------------------
// Read-merge helper
// ---------------------------------------------------------------------------

/**
 * Merges a list of real `Service` rows with unmigrated `CrewItem` rows,
 * producing a single deduplicated list of `FlightViewService` entries.
 *
 * Rules:
 *  - A CrewItem whose mirror Service already exists (id = "ci_<crewItemId>")
 *    is **skipped** — the real Service row takes precedence.
 *  - CrewItems without a mirror are projected via `crewItemToService()` and
 *    appended after the real services (stable order).
 *  - No DB writes; purely in-memory projection.
 *
 * This is the single place where the merge is applied.  `toFlightView()`
 * calls it so every consumer (GET /api/flights, GET /api/flights/[id], etc.)
 * automatically gets the unified list without extra logic.
 */
export function mergeCrewItemsIntoServices(
  services: FlightViewService[],
  crewItems: CrewItemRecord[],
): FlightViewService[] {
  // Build a Set of Service ids that are already present.
  const existingIds = new Set(services.map((s) => s.id));

  const extras: FlightViewService[] = [];
  for (const item of crewItems) {
    const mirrorId = crewItemServiceId(item.id);
    if (existingIds.has(mirrorId)) {
      // Mirror Service already in the list — skip to avoid duplication.
      continue;
    }
    const mapped = crewItemToService(item);
    // Project to FlightViewService shape, filling optional time fields with null.
    extras.push({
      id: mapped.id,
      visitId: mapped.visitId,
      type: mapped.type,
      direction: mapped.direction,
      customName: mapped.customName,
      reference: null,
      target: mapped.target,
      origin: mapped.origin,
      quantity: mapped.quantity,
      rawDescription: mapped.rawDescription,
      state: mapped.state,
      arrivedAt: null,
      deliveredAt: null,
      scheduledAt: null,
      createdAt: new Date(0),  // sentinel: no real DB timestamp available
      updatedAt: new Date(0),
    });
  }

  return extras.length === 0 ? services : [...services, ...extras];
}

export function toFlightView(visit: VisitWithMovements): FlightView {
  const arr = pick(visit.movements as AnyRecord[], "ARRIVAL");
  const dep = pick(visit.movements as AnyRecord[], "DEPARTURE");

  // Resolve airport city/name once per leg (curated catalog first, then the
  // OurAirports fallback). Done here so the client never loads the big dataset.
  const originInfo = resolveAirport((arr?.origin as string | null) ?? null);
  const destInfo = resolveAirport((dep?.destination as string | null) ?? null);

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
    originCity: originInfo?.city ?? null,
    originName: originInfo?.name ?? null,
    eta: (arr?.eta as string | null) ?? null,
    arrivalDate: dateToDdMm((visit.arrivalDate ?? (arr?.scheduledDate as Date | null)) || null),

    destination: (dep?.destination as string | null) ?? null,
    destCity: destInfo?.city ?? null,
    destName: destInfo?.name ?? null,
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
    state: mostAdvancedState(arr?.state as string | undefined, dep?.state as string | undefined),
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

    assignedToId: visit.assignedToId ?? null,
    assignedToName: visit.assignedTo?.name ?? null,

    rqstNumber: (dep?.rqstNumber as string | null) ?? (arr?.rqstNumber as string | null) ?? null,
    flightCategory: ((dep?.flightCategory as string) || (arr?.flightCategory as string) || "COMMERCIAL") as FlightView["flightCategory"],
    modifiedFlag: Boolean(dep?.modifiedFlag || arr?.modifiedFlag),
    petCount: (dep?.petCount as number) ?? (arr?.petCount as number) ?? 0,

    services: mergeCrewItemsIntoServices(
      (visit.services ?? []) as FlightViewService[],
      (visit.crewItems ?? []) as CrewItemRecord[],
    ),
    lostItems: visit.lostItems as FlightViewLostItem[] | undefined,
    crewItems: visit.crewItems as FlightViewCrewItem[] | undefined,
    tasks: collectTasks(arr, dep),
    // Proyección explícita (no spread) para no filtrar campos futuros del
    // modelo EventLog al wire. `action`/`details` no llevan PII (ver
    // pii-audit-log.test.ts) — referencian ids y códigos de estado — y el
    // autor se reduce a { name }.
    eventLogs: visit.eventLogs
      ? (visit.eventLogs as AnyRecord[]).map((e): FlightViewEventLogWithUser => ({
          id: e.id as string,
          visitId: (e.visitId as string | null) ?? undefined,
          movementId: (e.movementId as string | null) ?? undefined,
          userId: (e.userId as string | null) ?? null,
          action: e.action as string,
          details: (e.details as string | null) ?? null,
          timestamp: e.timestamp as Date | string,
          user: e.user ? { name: (e.user as { name: string }).name } : null,
        }))
      : undefined,
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
