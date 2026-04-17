// Detect parking conflicts: two or more flights assigned to the same parking
// spot with overlapping presence times (ETA...ETD window).

import { Flight } from "@prisma/client";

function timeToMinutes(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
}

/**
 * Returns a map of flightId → conflicting flightIds (those sharing parking with time overlap).
 */
export function detectParkingConflicts(flights: Flight[]): Map<string, string[]> {
  const conflicts = new Map<string, string[]>();

  // Group by parking spot
  const byParking = new Map<string, Flight[]>();
  for (const f of flights) {
    if (!f.parking || f.state === "DISPATCHED") continue;
    const key = f.parking.toUpperCase().trim();
    if (!byParking.has(key)) byParking.set(key, []);
    byParking.get(key)!.push(f);
  }

  // For each parking, check overlap between flight windows (ETA...ETD)
  for (const [, flightsInSpot] of byParking) {
    if (flightsInSpot.length < 2) continue;

    for (let i = 0; i < flightsInSpot.length; i++) {
      for (let j = i + 1; j < flightsInSpot.length; j++) {
        const a = flightsInSpot[i];
        const b = flightsInSpot[j];
        if (windowsOverlap(a, b)) {
          if (!conflicts.has(a.id)) conflicts.set(a.id, []);
          if (!conflicts.has(b.id)) conflicts.set(b.id, []);
          conflicts.get(a.id)!.push(b.id);
          conflicts.get(b.id)!.push(a.id);
        }
      }
    }
  }

  return conflicts;
}

function windowsOverlap(a: Flight, b: Flight): boolean {
  // Window = [eta, etd]. If either has no ETA, treat as open-start (0).
  // If no ETD, treat as open-end (24*60).
  const aStart = timeToMinutes(a.eta) ?? 0;
  const aEnd = timeToMinutes(a.etd) ?? 24 * 60;
  const bStart = timeToMinutes(b.eta) ?? 0;
  const bEnd = timeToMinutes(b.etd) ?? 24 * 60;

  // Overlap if a starts before b ends AND b starts before a ends
  return aStart < bEnd && bStart < aEnd;
}
