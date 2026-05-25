/**
 * Pure helper that derives visit/movement state from PDF arrival+departure dates.
 * Extracted from the PUT handler in /api/import/route.ts so it can be unit-tested
 * without any HTTP or Prisma machinery.
 *
 * Policy ("Plan del PDF, operativo intocable"):
 *   - ARRIVAL state: PARKED when the aircraft arrived on a prior day (pernocta), else EXPECTED.
 *   - DEPARTURE state: always EXPECTED (the flight has not departed yet).
 *   - visitDay: the arrival day (pernocta anchors the visit to the arrival date).
 *   - visitType: OVERNIGHT when arrDate ≠ depDate, else TURNAROUND.
 */

import { parseDate } from "@/lib/pdfParser";

export interface ResolveImportStateResult {
  isOvernight: boolean;
  arrivalState: "PARKED" | "EXPECTED";
  departureState: "EXPECTED";
  visitDay: Date; // palmaDay for the Visit — always the arrival day
  visitType: "OVERNIGHT" | "TURNAROUND";
}

export function resolveImportState(
  arrivalDate: string | undefined,
  departureDate: string | undefined,
  targetDate: Date
): ResolveImportStateResult {
  const arrDay = arrivalDate ? parseDate(arrivalDate) : targetDate;

  const isOvernight = Boolean(
    arrivalDate && departureDate && arrivalDate !== departureDate
  );

  // ARRIVAL: PARKED only when this is a pernocta whose arrival was before the
  // target day (the aircraft is already on the ground).
  const arrivalState: "PARKED" | "EXPECTED" =
    isOvernight && arrDay.getTime() < targetDate.getTime() ? "PARKED" : "EXPECTED";

  // DEPARTURE: always EXPECTED — the flight has not departed yet regardless of
  // overnight status.
  const departureState = "EXPECTED" as const;

  return {
    isOvernight,
    arrivalState,
    departureState,
    visitDay: arrDay,
    visitType: isOvernight ? "OVERNIGHT" : "TURNAROUND",
  };
}
