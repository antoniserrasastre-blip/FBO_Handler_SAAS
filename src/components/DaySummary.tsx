"use client";

import { Flight } from "@/types/compat";

interface DaySummaryProps {
  flights: Flight[];
}

/**
 * Per-phase stat strip under the global Helix chrome.
 * Date nav + live status + admin/salir all live in the global header now;
 * this component shows ONLY the operations-floor counters.
 */
export function DaySummary({ flights }: DaySummaryProps) {
  const onGround = flights.filter((f) => f.state === "ON_GROUND").length;
  const expected = flights.filter((f) => f.state === "EXPECTED").length;
  const boarding = flights.filter((f) => f.state === "BOARDING").length;
  const dispatched = flights.filter((f) => f.state === "DISPATCHED").length;
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
        <PhaseStat label="Desp." value={dispatched} tone="departed" />
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
