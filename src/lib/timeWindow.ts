// Time-window helpers for the "Próximas Nh" filter.
//
// `FlightView.arrivalInstant` / `departureInstant` are `Date | string | null`
// (the JSON wire format serialises Dates to ISO strings, but in-process code
// receives real `Date` objects from `toFlightView()`). These helpers normalise
// both shapes and centralise the ±N hours window math so the dashboard filter
// and any future consumer share one definition.

/**
 * True if `instant` falls within ±hours of `now`. Comparison happens in
 * absolute time (UTC milliseconds), so timezone is irrelevant.
 *
 * Null, undefined, or invalid instants → false.
 */
export function isWithinHours(
  instant: Date | string | null | undefined,
  hours: number,
  now: Date = new Date(),
): boolean {
  if (instant == null) return false;
  const date = instant instanceof Date ? instant : new Date(instant);
  const t = date.getTime();
  if (Number.isNaN(t)) return false;
  const windowMs = hours * 3600 * 1000;
  const diff = Math.abs(t - now.getTime());
  return diff <= windowMs;
}

/**
 * True if either of a flight's arrivalInstant / departureInstant is within
 * ±hours of `now`. Convenience wrapper around `isWithinHours`.
 */
export function flightWithinHours(
  flight: { arrivalInstant?: Date | string | null; departureInstant?: Date | string | null },
  hours: number,
  now: Date = new Date(),
): boolean {
  return (
    isWithinHours(flight.arrivalInstant, hours, now) ||
    isWithinHours(flight.departureInstant, hours, now)
  );
}
