// Legacy type aliases for UI components that used to import from `@prisma/client`.
// The v1 Prisma models (Flight, DaySheet, Service, Passenger, CrewMember,
// LostItem) no longer exist; these aliases bridge UI imports to the v2 shape.

export type { FlightView as Flight, FlightViewService as Service, FlightViewLostItem as LostItem, FlightViewCrewItem as CrewItem, FlightViewTask as Task } from "./v2";

export interface DaySheet {
  id: string;
  date: Date | string;
}

export interface Passenger {
  id: string;
  movementId?: string;
  flightId?: string;          // legacy alias surfaced by endpoints (= movementId)
  direction: string;
  fullName: string;
  gender: string | null;
  nationality: string | null;
  passportNumber: string | null;
  dateOfBirth: string | null;
  status: string;
  verified: boolean;
  corrections?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface CrewMember {
  id: string;
  flightId?: string;
  direction: string;
  fullName: string;
  nationality: string | null;
  passportNumber: string | null;
  dateOfBirth: string | null;
  role: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface EventLog {
  id: string;
  visitId?: string;
  flightId?: string;
  movementId?: string;
  userId: string | null;
  action: string;
  details: string | null;
  timestamp: Date | string;
}
