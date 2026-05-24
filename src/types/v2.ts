// Domain types for the v2 schema (Operator / Aircraft / Visit / Movement).
//
// `FlightView` is the adapter shape: it mirrors the deprecated `Flight` model
// so existing UI components keep working. It is constructed from a Visit plus
// its ARRIVAL/DEPARTURE Movements by `src/lib/flightView.ts`.

export const MOVEMENT_DIRECTIONS = ["ARRIVAL", "DEPARTURE"] as const;
export type MovementDirection = (typeof MOVEMENT_DIRECTIONS)[number];

export const VISIT_TYPES = ["TURNAROUND", "OVERNIGHT"] as const;
export type VisitType = (typeof VISIT_TYPES)[number];

export const FLIGHT_CATEGORIES = ["COMMERCIAL", "FERRY", "CANCELLED"] as const;
export type FlightCategory = (typeof FLIGHT_CATEGORIES)[number];

export const SERVICE_ORIGINS = ["NETJETS", "CATERING_AIRE", "MCR", "OTHER"] as const;
export type ServiceOrigin = (typeof SERVICE_ORIGINS)[number];

export const PASSPORT_TYPES = ["NID", "PP"] as const;
export type PassportType = (typeof PASSPORT_TYPES)[number];

export const PASSENGER_SOURCES = [
  "NETJETS",
  "VISTAJET",
  "EJU",
  "GENDEC_PASTE",
  "MANUAL",
] as const;
export type PassengerSource = (typeof PASSENGER_SOURCES)[number];

/**
 * Shape consumed by FlightCard / page.tsx / dia / timeline. Mirrors the old
 * Prisma `Flight` model field-for-field plus a few v2-only extras (visitId,
 * arrivalMovementId, departureMovementId, rqstNumber, flightCategory).
 *
 * `id` here is the Visit id — endpoints `/api/flights/[id]/*` use it as the
 * resource id. Internal logic re-resolves to the appropriate Movement when
 * mutating direction-specific fields.
 */
export interface FlightView {
  id: string;                          // = visitId
  visitId: string;
  arrivalMovementId: string | null;
  departureMovementId: string | null;

  daySheetId: string;                  // = visit.palmaDay ISO (derived)
  callsign: string;                    // from DEPARTURE if exists else ARRIVAL
  arrivalCallsign: string;             // empty string if no ARRIVAL leg
  departureCallsign: string;           // empty string if no DEPARTURE leg
  registration: string;
  aircraftType: string;
  origin: string | null;
  eta: string | null;
  arrivalDate: string | null;          // "DD/MM" for UI compat
  destination: string | null;
  etd: string | null;
  departureDate: string | null;        // "DD/MM"
  // Resolved airport city/name (curated catalog first, OurAirports fallback).
  // Filled server-side in toFlightView() so the client never loads the big dataset.
  originCity: string | null;
  originName: string | null;
  destCity: string | null;
  destName: string | null;
  /**
   * Combined UTC instant of the arrival (scheduledDate of ARRIVAL Movement
   * + eta HH:MM Zulu). Null when either piece is missing. Used by the
   * "Próximas 8 horas" filter and any other window-based logic. Display
   * code should keep using `arrivalDate` / `eta`.
   */
  arrivalInstant: Date | string | null;
  /**
   * Same for the departure leg (scheduledDate of DEPARTURE Movement + etd).
   */
  departureInstant: Date | string | null;
  parking: string | null;
  tobt: string | null;
  state: string;
  isOvernight: boolean;

  crewArrival: number;
  crewArrivalReal: number | null;
  paxArrival: number;
  paxArrivalReal: number | null;
  crewDeparture: number;
  crewDepartureReal: number | null;
  paxDeparture: number;
  paxDepartureReal: number | null;

  paxArrBagsChecked: number;
  paxArrBagsCabin: number;
  paxArrBagsState: string;
  paxArrTransportType: string;
  paxArrTransportState: string;
  paxArrState: string;
  paxDepBagsChecked: number;
  paxDepBagsCabin: number;
  paxDepBagsState: string;
  paxDepTransportType: string;
  paxDepTransportState: string;
  paxDepState: string;

  crewArrLocation: string;
  crewDepLocation: string;

  fuelState: string;
  fuelRequestedAt: string | null;
  fuelServedAt: string | null;
  toiletState: string;
  toiletRequestedAt: string | null;
  toiletCompletedAt: string | null;

  linkedFlightId: string | null;
  notes: string | null;

  // Rampa: handler de turno al que el coordinador asignó el vuelo entero.
  assignedToId: string | null;
  assignedToName: string | null;

  // v2-only fields surfaced for new UI features
  rqstNumber: string | null;
  flightCategory: FlightCategory;
  modifiedFlag: boolean;
  petCount: number;

  // Live ADS-B snapshot from OpenSky. Sourced from whichever Movement leg
  // (ARRIVAL or DEPARTURE) has the most recent liveLastSeenAt.
  ata?: string | null;                 // actual time of arrival
  atd?: string | null;                 // actual time of departure
  livePhase?: string | null;
  liveLastSeenAt?: Date | string | null;
  liveOnGround?: boolean | null;
  liveAltitudeM?: number | null;
  liveVelocityMs?: number | null;

  services?: FlightViewService[];
  lostItems?: FlightViewLostItem[];
  crewItems?: FlightViewCrewItem[];
  tasks?: FlightViewTask[];

  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface FlightViewService {
  id: string;
  visitId?: string;
  flightId?: string;
  type: string;
  direction?: string;
  phase?: string;
  customName: string | null;
  reference: string | null;
  target: string | null;
  origin: string | null;
  quantity?: number;
  rawDescription?: string | null;
  state: string;
  arrivedAt: string | null;
  deliveredAt: string | null;
  scheduledAt?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface FlightViewLostItem {
  id: string;
  visitId?: string;
  flightId?: string;
  description: string;
  location: string;
  state: string;
  foundAt: string | null;
  claimedAt: string | null;
  deliveredAt: string | null;
  claimedBy: string | null;
  createdAt: Date | string;
}

export interface FlightViewCrewItem {
  id: string;
  visitId?: string;
  type: string;            // CrewItemType
  customName: string | null;
  quantity: number;
  state: string;           // STORED | RETURNED
  notes: string | null;
  storedAt: Date | string | null;
  returnedAt: Date | string | null;
  createdAt: Date | string;
}

export interface FlightViewTask {
  id: string;
  movementId?: string;
  type: string;                          // TaskType
  state: string;                         // PENDING | DONE | NA
  direction: "ARRIVAL" | "DEPARTURE";
  doneAt: Date | string | null;
}
