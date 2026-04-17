"use client";

import { useEffect, useRef, useState } from "react";
import { Service } from "@prisma/client";
import { isServiceOverdue } from "@/lib/overdue";

// Beep sound (short ping) — generated via Web Audio API, no file needed
function playPing() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880; // A5
    gain.gain.value = 0.15;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.stop(ctx.currentTime + 0.4);
  } catch {
    // Silently fail if audio not available
  }
}

/**
 * Tracks overdue services across all flights.
 * When a NEW service becomes overdue, plays a ping (once per service).
 * Returns current overdue count.
 */
export function useOverdueAlert(services: Service[], soundEnabled: boolean) {
  const knownOverdueIds = useRef<Set<string>>(new Set());
  const [overdueCount, setOverdueCount] = useState(0);

  useEffect(() => {
    const currentOverdue = services.filter(isServiceOverdue);
    const currentIds = new Set(currentOverdue.map((s) => s.id));

    // Check for newly overdue services
    const newlyOverdue = currentOverdue.filter((s) => !knownOverdueIds.current.has(s.id));
    if (newlyOverdue.length > 0 && soundEnabled && knownOverdueIds.current.size > 0) {
      // Don't ping on initial load (when knownOverdueIds is empty)
      playPing();
    }

    knownOverdueIds.current = currentIds;
    setOverdueCount(currentOverdue.length);
  }, [services, soundEnabled]);

  return overdueCount;
}
