// Service overdue detection
// A service is overdue if it has a scheduledAt time and is still PENDING
// past the threshold (default 15 min)

import { Service } from "@prisma/client";

/**
 * Parse a time string "HH:MM" and compare to current time
 * Returns true if current time is more than `thresholdMinutes` past scheduledAt
 */
export function isServiceOverdue(service: Service & { scheduledAt?: string | null }, thresholdMinutes = 15): boolean {
  if (!service.scheduledAt || service.state === "DELIVERED") return false;

  const match = service.scheduledAt.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    // Try extracting time from service name like "Catering Aire 08:00"
    const nameMatch = (service.customName || "").match(/(\d{1,2}):(\d{2})/);
    if (!nameMatch) return false;
    return checkOverdue(parseInt(nameMatch[1]), parseInt(nameMatch[2]), thresholdMinutes);
  }

  return checkOverdue(parseInt(match[1]), parseInt(match[2]), thresholdMinutes);
}

function checkOverdue(hours: number, minutes: number, thresholdMinutes: number): boolean {
  const now = new Date();
  const scheduledMinutes = hours * 60 + minutes;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  return currentMinutes > scheduledMinutes + thresholdMinutes;
}

/**
 * Check if a service name contains a time (for display and overdue detection)
 * Returns the time string or null
 */
export function extractServiceTime(serviceName: string): string | null {
  const match = serviceName.match(/(\d{1,2}:\d{2})/);
  return match ? match[1] : null;
}
