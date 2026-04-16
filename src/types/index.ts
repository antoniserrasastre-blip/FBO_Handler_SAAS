// Flight states
export const FLIGHT_STATES = ["EXPECTED", "ON_GROUND", "BOARDING", "DISPATCHED"] as const;
export type FlightState = (typeof FLIGHT_STATES)[number];

// Service types
export const SERVICE_TYPES = [
  "CATERING",
  "DISHES",
  "COOLER_BAG",
  "STORAGE_BAG",
  "LAUNDRY",
  "THERMOS",
  "NEWSPAPERS",
  "CUSTOM",
] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

export const SERVICE_LABELS: Record<ServiceType, string> = {
  CATERING: "Catering",
  DISHES: "Vajillas",
  COOLER_BAG: "Bolsa nevera",
  STORAGE_BAG: "Bolsa almacen",
  LAUNDRY: "Laundry",
  THERMOS: "Thermos",
  NEWSPAPERS: "Periodicos",
  CUSTOM: "Extra",
};

export const SERVICE_TARGETS = ["CREW", "PAX"] as const;
export type ServiceTarget = (typeof SERVICE_TARGETS)[number];

export const SERVICE_TARGET_LABELS: Record<ServiceTarget, string> = {
  CREW: "Crew",
  PAX: "Pax",
};

// Flight state colors and labels
export const FLIGHT_STATE_CONFIG: Record<
  FlightState,
  { label: string; color: string; bg: string; text: string }
> = {
  EXPECTED: {
    label: "Esperado",
    color: "#9CA3AF",
    bg: "bg-gray-100",
    text: "text-gray-700",
  },
  ON_GROUND: {
    label: "En tierra",
    color: "#3B82F6",
    bg: "bg-blue-100",
    text: "text-blue-700",
  },
  BOARDING: {
    label: "Embarque",
    color: "#EAB308",
    bg: "bg-yellow-100",
    text: "text-yellow-700",
  },
  DISPATCHED: {
    label: "Despachado",
    color: "#22C55E",
    bg: "bg-green-100",
    text: "text-green-700",
  },
};

export const FUEL_STATES = ["NOT_REQUESTED", "REQUESTED", "SERVED"] as const;
export type FuelState = (typeof FUEL_STATES)[number];

export const FUEL_LABELS: Record<FuelState, string> = {
  NOT_REQUESTED: "No pedido",
  REQUESTED: "Pedido",
  SERVED: "Servido",
};

export const TOILET_STATES = ["NOT_REQUESTED", "REQUESTED", "COMPLETED"] as const;
export type ToiletState = (typeof TOILET_STATES)[number];

export const TOILET_LABELS: Record<ToiletState, string> = {
  NOT_REQUESTED: "No pedido",
  REQUESTED: "Pedido",
  COMPLETED: "Completado",
};

// --- Arrival-specific states ---

export const PAX_ARR_STATES = ["IN_AIRCRAFT", "IN_LOUNGE", "COMPLETED"] as const;
export type PaxArrState = (typeof PAX_ARR_STATES)[number];

export const PAX_ARR_STATE_LABELS: Record<PaxArrState, string> = {
  IN_AIRCRAFT: "En avion",
  IN_LOUNGE: "En sala",
  COMPLETED: "Completado",
};

export const BAGS_ARR_STATES = ["IN_AIRCRAFT", "UNLOADED", "DELIVERED"] as const;
export type BagsArrState = (typeof BAGS_ARR_STATES)[number];

export const BAGS_ARR_STATE_LABELS: Record<BagsArrState, string> = {
  IN_AIRCRAFT: "En avion",
  UNLOADED: "Descargadas",
  DELIVERED: "Entregadas",
};

// --- Departure-specific states ---

export const PAX_DEP_STATES = ["NOT_ARRIVED", "IN_LOUNGE", "BOARDED"] as const;
export type PaxDepState = (typeof PAX_DEP_STATES)[number];

export const PAX_DEP_STATE_LABELS: Record<PaxDepState, string> = {
  NOT_ARRIVED: "No llegados",
  IN_LOUNGE: "En sala",
  BOARDED: "Embarcados",
};

export const BAGS_DEP_STATES = ["NOT_ARRIVED", "TAGGED", "SENT_TO_AIRCRAFT"] as const;
export type BagsDepState = (typeof BAGS_DEP_STATES)[number];

export const BAGS_DEP_STATE_LABELS: Record<BagsDepState, string> = {
  NOT_ARRIVED: "No llegadas",
  TAGGED: "Etiquetadas",
  SENT_TO_AIRCRAFT: "Enviadas a avion",
};

// --- Shared states ---

export const TRANSPORT_TYPES = ["RENTAL_CAR", "PREPARED_CAR", "TAXI", "UNDEFINED"] as const;
export type TransportType = (typeof TRANSPORT_TYPES)[number];

export const TRANSPORT_LABELS: Record<TransportType, string> = {
  RENTAL_CAR: "Coche alquiler",
  PREPARED_CAR: "Coche preparado",
  TAXI: "Taxi",
  UNDEFINED: "Sin definir",
};

export const TRANSPORT_STATE_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  CONFIRMED: "Confirmado",
};

export const CREW_LOCATION_LABELS: Record<string, string> = {
  IN_AIRCRAFT: "En avion",
  IN_LOUNGE: "En sala",
};

// Legacy exports for backwards compat during transition
export const PAX_STATES = PAX_DEP_STATES;
export type PaxState = PaxDepState;
export const PAX_STATE_LABELS = PAX_DEP_STATE_LABELS;

// --- v0.3: Passenger statuses ---

export const PASSENGER_STATUSES = ["CONFIRMED", "NO_SHOW", "ADDED"] as const;
export type PassengerStatus = (typeof PASSENGER_STATUSES)[number];

export const PASSENGER_STATUS_CONFIG: Record<PassengerStatus, { label: string; bg: string; text: string }> = {
  CONFIRMED: { label: "Confirmado", bg: "bg-green-100", text: "text-green-700" },
  NO_SHOW: { label: "No-show", bg: "bg-red-100", text: "text-red-700" },
  ADDED: { label: "Anadido", bg: "bg-blue-100", text: "text-blue-700" },
};

// --- v0.3: Crew roles ---

export const CREW_ROLES = ["CAPTAIN", "FIRST_OFFICER", "CABIN_CREW", "OTHER"] as const;
export type CrewRole = (typeof CREW_ROLES)[number];

export const CREW_ROLE_LABELS: Record<CrewRole, string> = {
  CAPTAIN: "Comandante",
  FIRST_OFFICER: "Copiloto",
  CABIN_CREW: "TCP",
  OTHER: "Otro",
};

// --- v0.3: Lost & Found ---

export const LOST_ITEM_STATES = ["FOUND", "CLAIMED", "DELIVERED"] as const;
export type LostItemState = (typeof LOST_ITEM_STATES)[number];

export const LOST_ITEM_STATE_CONFIG: Record<LostItemState, { label: string; bg: string; text: string }> = {
  FOUND: { label: "Encontrado", bg: "bg-amber-100", text: "text-amber-700" },
  CLAIMED: { label: "Reclamado", bg: "bg-blue-100", text: "text-blue-700" },
  DELIVERED: { label: "Entregado", bg: "bg-green-100", text: "text-green-700" },
};

export const LOST_ITEM_LOCATIONS = ["AIRCRAFT", "LOUNGE", "RAMP"] as const;
export type LostItemLocation = (typeof LOST_ITEM_LOCATIONS)[number];

export const LOST_ITEM_LOCATION_LABELS: Record<LostItemLocation, string> = {
  AIRCRAFT: "Avion",
  LOUNGE: "Sala",
  RAMP: "Pista",
};

// --- v0.3: Direction ---

export const DIRECTIONS = ["ARRIVAL", "DEPARTURE"] as const;
export type Direction = (typeof DIRECTIONS)[number];

export const DIRECTION_LABELS: Record<Direction, string> = {
  ARRIVAL: "Llegada",
  DEPARTURE: "Salida",
};

// Roles
export const ROLES = ["ADMIN", "SUPERVISOR", "HANDLER", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrador",
  SUPERVISOR: "Jefe de turno",
  HANDLER: "Handler",
  VIEWER: "Viewer (solo lectura)",
};

// Extend next-auth types
declare module "next-auth" {
  interface User {
    role?: string;
  }
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      role?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
    id?: string;
  }
}
