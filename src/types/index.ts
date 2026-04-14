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

export const SERVICE_ICONS: Record<ServiceType, string> = {
  CATERING: "🍽️",
  DISHES: "🍽️",
  COOLER_BAG: "🧊",
  STORAGE_BAG: "📦",
  LAUNDRY: "👔",
  THERMOS: "☕",
  NEWSPAPERS: "📰",
  CUSTOM: "🔧",
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

export const TRANSPORT_TYPES = ["RENTAL_CAR", "PREPARED_CAR", "TAXI", "UNDEFINED"] as const;
export type TransportType = (typeof TRANSPORT_TYPES)[number];

export const TRANSPORT_LABELS: Record<TransportType, string> = {
  RENTAL_CAR: "Coche alquiler",
  PREPARED_CAR: "Coche preparado",
  TAXI: "Taxi",
  UNDEFINED: "Sin definir",
};

export const PAX_STATES = ["NOT_ARRIVED", "IN_LOUNGE", "BOARDED"] as const;
export type PaxState = (typeof PAX_STATES)[number];

export const PAX_STATE_LABELS: Record<PaxState, string> = {
  NOT_ARRIVED: "No llegados",
  IN_LOUNGE: "En sala",
  BOARDED: "Embarcados",
};

// Roles
export const ROLES = ["ADMIN", "HANDLER", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrador",
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
