/**
 * Robuste time utilities for MALLORCAIR FBO.
 * Everything is centered around Europe/Madrid timezone.
 */

/**
 * Returns midnight UTC of the Palma (Europe/Madrid) local day for the given instant.
 * Per CLAUDE.md: DaySheet dates MUST be midnight UTC computed from the Palma local date.
 *
 * Accepts:
 *   - undefined → uses now
 *   - Date → uses that instant
 *   - "YYYY-MM-DD" string → treated as the Palma local date directly (no TZ conversion)
 */
export function palmaDayUtc(input?: Date | string): Date {
  if (typeof input === "string") {
    const match = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0));
    }
    return palmaDayUtc(new Date(input));
  }

  const instant = input ?? new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(instant);
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value;
  const year = parseInt(getPart("year") || "0", 10);
  const month = parseInt(getPart("month") || "0", 10);
  const day = parseInt(getPart("day") || "0", 10);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

/** @deprecated Use palmaDayUtc() instead. */
export function getSpainToday() {
  return palmaDayUtc();
}

export function dateToSqlString(date: Date) {
  // Returns YYYY-MM-DD from a UTC date
  return date.toISOString().split("T")[0];
}

export function getZuluNow() {
  const now = new Date();
  return {
    hours: now.getUTCHours(),
    minutes: now.getUTCMinutes(),
    totalMinutes: now.getUTCHours() * 60 + now.getUTCMinutes()
  };
}

/**
 * Returns the Madrid wall-clock time as total minutes (hour*60 + minute)
 * for the given instant, computed via Intl — independent of the process TZ.
 *
 * Per CLAUDE.md: extras/catering times are in Madrid peninsular local time.
 * Use this instead of getHours()/getMinutes() so the result is correct even
 * when the container runs under TZ=UTC.
 */
export function madridWallMinutes(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Madrid",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(instant);
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  const hour = parseInt(getPart("hour"), 10);
  const minute = parseInt(getPart("minute"), 10);
  return hour * 60 + minute;
}
