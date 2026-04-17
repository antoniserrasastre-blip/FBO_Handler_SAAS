"use client";

import { useEffect, useState } from "react";

/**
 * Live countdown to a target HH:MM time. Updates every 30s.
 * Returns minutes until target (negative if past).
 * Returns null if time is invalid.
 */
export function useLiveCountdown(targetTime: string | null | undefined): number | null {
  const [minutesLeft, setMinutesLeft] = useState<number | null>(() => calcMinutes(targetTime));

  useEffect(() => {
    setMinutesLeft(calcMinutes(targetTime));
    const interval = setInterval(() => {
      setMinutesLeft(calcMinutes(targetTime));
    }, 30000);
    return () => clearInterval(interval);
  }, [targetTime]);

  return minutesLeft;
}

function calcMinutes(targetTime: string | null | undefined): number | null {
  if (!targetTime) return null;
  const match = targetTime.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const targetMinutes = parseInt(match[1]) * 60 + parseInt(match[2]);
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  return targetMinutes - currentMinutes;
}
