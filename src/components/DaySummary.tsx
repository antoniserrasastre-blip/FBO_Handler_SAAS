"use client";

import { Flight } from "@/types/compat";
import { normalizeFlightState } from "@/types";

interface DaySummaryProps {
  flights: Flight[];
}

export interface PhaseCounts {
  onGround: number;
  expected: number;
  boarding: number;
  departed: number;
}

/**
 * Conteo de fases sobre los estados REALES persistidos (enum legacy de 6),
 * normalizados con normalizeFlightState para datos viejos (ON_GROUND, DISPATCHED):
 *   Tierra = ON_BLOCKS + PARKED + TURNAROUND · Esper. = EXPECTED ·
 *   Embar. = BOARDING · Desp. = OFF_BLOCKS.
 * Exportado para tests.
 */
export function computePhaseCounts(flights: Pick<Flight, "state">[]): PhaseCounts {
  const counts: PhaseCounts = { onGround: 0, expected: 0, boarding: 0, departed: 0 };
  for (const f of flights) {
    switch (normalizeFlightState(f.state)) {
      case "ON_BLOCKS":
      case "PARKED":
      case "TURNAROUND":
        counts.onGround++;
        break;
      case "EXPECTED":
        counts.expected++;
        break;
      case "BOARDING":
        counts.boarding++;
        break;
      case "OFF_BLOCKS":
        counts.departed++;
        break;
    }
  }
  return counts;
}

/**
 * Per-phase stat strip under the global Helix chrome.
 * Date nav + live status + admin/salir all live in the global header now;
 * this component shows ONLY the operations-floor counters.
 */
export function DaySummary({ flights }: DaySummaryProps) {
  const { onGround, expected, boarding, departed } = computePhaseCounts(flights);
  const paxInLounge = flights.reduce((sum, f) => {
    let count = 0;
    if (f.paxArrState === "IN_LOUNGE") count += f.paxArrival;
    if (f.paxDepState === "IN_LOUNGE") count += f.paxDeparture;
    return sum + count;
  }, 0);

  return (
    <div className="border-b border-line-subtle bg-bg">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 font-mono text-xs sm:px-4 [font-variant-numeric:tabular-nums]">
        <PhaseStat label="Tierra" value={onGround} tone="onblocks" />
        <PhaseStat label="Esper." value={expected} tone="expected" />
        <PhaseStat label="Embar." value={boarding} tone="board" />
        <PhaseStat label="Desp." value={departed} tone="departed" />
        <span className="text-ink-disabled">·</span>
        <PhaseStat label="Pax sala" value={paxInLounge} tone="overnight" />
      </div>
    </div>
  );
}

const PHASE_TONE: Record<string, string> = {
  onblocks: "text-fbo-onblocks",
  expected: "text-ink-3",
  board: "text-fbo-board",
  departed: "text-fbo-departed",
  overnight: "text-fbo-overnight",
};

function PhaseStat({ label, value, tone }: { label: string; value: number; tone: keyof typeof PHASE_TONE }) {
  return (
    <span className="text-ink-muted">
      {label}:{" "}
      <span className={`font-semibold ${PHASE_TONE[tone]}`}>{value}</span>
    </span>
  );
}
