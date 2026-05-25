// Service overdue detection.
// A service is overdue if it has a scheduled time and is still PENDING
// past the threshold (default 15 min).
//
// v2 uses structural typing so callers can pass v2 Service rows or any
// matching shape.

import { madridWallMinutes } from "./time";

export interface OverdueServiceLike {
  state: string;
  scheduledAt?: string | null;
  customName?: string | null;
  rawDescription?: string | null;
}

export function isServiceOverdue(
  service: OverdueServiceLike,
  thresholdMinutes = 15,
  now: Date = new Date(),
): boolean {
  if (service.state === "DELIVERED") return false;

  const explicit = service.scheduledAt && service.scheduledAt.match(/^(\d{1,2}):(\d{2})$/);
  if (explicit) {
    return checkOverdue(parseInt(explicit[1]), parseInt(explicit[2]), thresholdMinutes, now);
  }

  // Fallback: time embedded in customName or rawDescription ("Catering Aire 08:00")
  const embedded = (service.customName || service.rawDescription || "").match(/(\d{1,2}):(\d{2})/);
  if (!embedded) return false;
  return checkOverdue(parseInt(embedded[1]), parseInt(embedded[2]), thresholdMinutes, now);
}

function checkOverdue(
  hours: number,
  minutes: number,
  thresholdMinutes: number,
  now: Date = new Date(),
): boolean {
  const scheduledMinutes = hours * 60 + minutes;
  const currentMinutes = madridWallMinutes(now);
  return currentMinutes > scheduledMinutes + thresholdMinutes;
}

export function extractServiceTime(serviceName: string): string | null {
  const match = serviceName.match(/(\d{1,2}:\d{2})/);
  return match ? match[1] : null;
}
