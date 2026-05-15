// Service overdue detection.
// A service is overdue if it has a scheduled time and is still PENDING
// past the threshold (default 15 min).
//
// v2 uses structural typing so callers can pass v2 Service rows or any
// matching shape.

export interface OverdueServiceLike {
  state: string;
  scheduledAt?: string | null;
  customName?: string | null;
  rawDescription?: string | null;
}

export function isServiceOverdue(service: OverdueServiceLike, thresholdMinutes = 15): boolean {
  if (service.state === "DELIVERED") return false;

  const explicit = service.scheduledAt && service.scheduledAt.match(/^(\d{1,2}):(\d{2})$/);
  if (explicit) {
    return checkOverdue(parseInt(explicit[1]), parseInt(explicit[2]), thresholdMinutes);
  }

  // Fallback: time embedded in customName or rawDescription ("Catering Aire 08:00")
  const embedded = (service.customName || service.rawDescription || "").match(/(\d{1,2}):(\d{2})/);
  if (!embedded) return false;
  return checkOverdue(parseInt(embedded[1]), parseInt(embedded[2]), thresholdMinutes);
}

function checkOverdue(hours: number, minutes: number, thresholdMinutes: number): boolean {
  const now = new Date();
  const scheduledMinutes = hours * 60 + minutes;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  return currentMinutes > scheduledMinutes + thresholdMinutes;
}

export function extractServiceTime(serviceName: string): string | null {
  const match = serviceName.match(/(\d{1,2}:\d{2})/);
  return match ? match[1] : null;
}
