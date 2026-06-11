import { describe, it, expect } from "vitest";
import { computePhaseCounts } from "./DaySummary";

const f = (state: string) => ({ state });

describe("computePhaseCounts — fases sobre los estados reales (B3)", () => {
  it("groups the canonical 6-state enum into the four strip phases", () => {
    const counts = computePhaseCounts([
      f("EXPECTED"),
      f("ON_BLOCKS"),
      f("PARKED"),
      f("TURNAROUND"),
      f("BOARDING"),
      f("OFF_BLOCKS"),
    ]);
    expect(counts).toEqual({ onGround: 3, expected: 1, boarding: 1, departed: 1 });
  });

  it("normalizes legacy states (ON_GROUND → Tierra, DISPATCHED → Desp.)", () => {
    // Antes la franja contaba estados muertos (ON_GROUND/DISPATCHED literales)
    // que ya no se persisten: con datos reales, todo salía a 0.
    const counts = computePhaseCounts([f("ON_GROUND"), f("DISPATCHED")]);
    expect(counts).toEqual({ onGround: 1, expected: 0, boarding: 0, departed: 1 });
  });

  it("returns zeros for an empty day", () => {
    expect(computePhaseCounts([])).toEqual({ onGround: 0, expected: 0, boarding: 0, departed: 0 });
  });
});
