/**
 * Robuste time utilities for MALLORCAIR FBO.
 * Everything is centered around Europe/Madrid timezone.
 */

export function getSpainToday() {
  const now = new Date();
  
  // Format to specific parts to avoid locale/separator issues
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  
  const parts = formatter.formatToParts(now);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value;
  
  const year = parseInt(getPart("year") || "0", 10);
  const month = parseInt(getPart("month") || "0", 10);
  const day = parseInt(getPart("day") || "0", 10);
  
  // Return a date object representing midnight UTC of the Spain day
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
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
