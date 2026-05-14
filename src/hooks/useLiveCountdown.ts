"use client";

import { useEffect, useState } from "react";

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

  const targetMin = hh * 60 + mm;
  const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  let diff = targetMin - nowMin;
  if (diff > 12 * 60) diff -= 24 * 60;
  else if (diff < -12 * 60) diff += 24 * 60;
  return diff;
}
