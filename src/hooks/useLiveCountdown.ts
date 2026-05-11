"use client";

import { useEffect, useState } from "react";

/**
 * Live countdown to a target HH:MM time anchored to a specific UTC day.
 * Updates every 30s. Returns minutes until target (negative if past).
 * Returns null if time is invalid.
 *
 * `dayUtc` should be the DaySheet date (midnight UTC of the Palma local day
 * the flight belongs to). Without it the calculation falls back to a
 * heuristic that wraps around midnight — see calcMinutes.
 */
export function useLiveCountdown(
  targetTime: string | null | undefined,
  dayUtc?: Date | null,
): number | null {
  const dayKey = dayUtc ? dayUtc.getTime() : null;
  const [minutesLeft, setMinutesLeft] = useState<number | null>(() =>
    calcMinutes(targetTime, dayUtc ?? null),
  );

  useEffect(() => {
    setMinutesLeft(calcMinutes(targetTime, dayKey != null ? new Date(dayKey) : null));
    const interval = setInterval(() => {
      setMinutesLeft(calcMinutes(targetTime, dayKey != null ? new Date(dayKey) : null));
    }, 30000);
    return () => clearInterval(interval);
  }, [targetTime, dayKey]);

  return minutesLeft;
}

/**
 * Pure helper — exported for unit tests. `now` defaults to current time.
 *
 * If `dayUtc` is provided we compute target as that UTC day at HH:MM Zulu.
 * If not, we fall back to the legacy "wrap to nearest occurrence" heuristic:
 * compute the diff in minutes-of-day, then if it's > 12h pick the previous
 * occurrence, if < -12h pick the next one. This keeps backward compatibility
 * for callers that don't have the daysheet date handy.
 */
export function calcMinutes(
  targetTime: string | null | undefined,
  dayUtc: Date | null,
  now: Date = new Date(),
): number | null {
  if (!targetTime) return null;
  const match = targetTime.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hh = parseInt(match[1], 10);
  const mm = parseInt(match[2], 10);

  if (dayUtc) {
    const target = Date.UTC(
      dayUtc.getUTCFullYear(),
      dayUtc.getUTCMonth(),
      dayUtc.getUTCDate(),
      hh,
      mm,
    );
    return Math.round((target - now.getTime()) / 60000);
  }

  // Legacy fallback: minutes-of-day diff, snapped to nearest occurrence.
  const targetMin = hh * 60 + mm;
  const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  let diff = targetMin - nowMin;
  if (diff > 12 * 60) diff -= 24 * 60;
  else if (diff < -12 * 60) diff += 24 * 60;
  return diff;
}
