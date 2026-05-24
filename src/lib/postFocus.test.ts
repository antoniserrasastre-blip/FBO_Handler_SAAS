import { describe, it, expect } from "vitest";
import {
  deriveFocus,
  legOrder,
  hasSecondaryLeg,
  focusLeadsArrival,
  focusLeadsDeparture,
  nextFlightState,
  derivePrimaryAction,
} from "./postFocus";
import { SHIFT_POST_FOCUS, type ShiftPost } from "@/types";
import type { ChecklistTask } from "@/lib/checklist";

function task(over: Partial<ChecklistTask>): ChecklistTask {
  return {
    type: "PAX_OFF",
    label: "Pax recogidos",
    post: "RAMP",
    direction: "ARRIVAL",
    state: "PENDING",
    ...over,
  };
}

describe("deriveFocus", () => {
  it("returns FULL when there is no shift (undefined)", () => {
    expect(deriveFocus(undefined)).toBe("FULL");
  });

  it("returns FULL when the shift has no posts (empty array)", () => {
    expect(deriveFocus([])).toBe("FULL");
  });

  it("returns ARRIVAL for a lone ARRIVALS post", () => {
    expect(deriveFocus(["ARRIVALS"])).toBe("ARRIVAL");
  });

  it("returns DEPARTURE for a lone DEPARTURES post", () => {
    expect(deriveFocus(["DEPARTURES"])).toBe("DEPARTURE");
  });

  it("returns SERVICES for a lone RUNNER post", () => {
    expect(deriveFocus(["RUNNER"])).toBe("SERVICES");
  });

  it("returns FULL for RAMP (whole-flight post)", () => {
    expect(deriveFocus(["RAMP"])).toBe("FULL");
  });

  it("returns FULL for COORDINATOR (whole-flight post)", () => {
    expect(deriveFocus(["COORDINATOR"])).toBe("FULL");
  });

  it("returns FULL for the 'Filtro' combo (ARRIVALS + DEPARTURES)", () => {
    expect(deriveFocus(["ARRIVALS", "DEPARTURES"])).toBe("FULL");
  });

  it("returns FULL when a wide post is mixed with a narrow one", () => {
    expect(deriveFocus(["RAMP", "ARRIVALS"])).toBe("FULL");
    expect(deriveFocus(["COORDINATOR", "RUNNER"])).toBe("FULL");
  });

  it("collapses duplicate posts to the single-post focus", () => {
    expect(deriveFocus(["ARRIVALS", "ARRIVALS"])).toBe("ARRIVAL");
  });

  it("agrees with SHIFT_POST_FOCUS for every single-post case", () => {
    const expected: Record<string, string> = {
      ARRIVAL: "ARRIVAL",
      DEPARTURE: "DEPARTURE",
      SERVICES: "SERVICES",
      BOTH: "FULL",
    };
    (Object.keys(SHIFT_POST_FOCUS) as ShiftPost[]).forEach((post) => {
      expect(deriveFocus([post])).toBe(expected[SHIFT_POST_FOCUS[post]]);
    });
  });
});

describe("legOrder", () => {
  it("leads with arrival on FULL", () => {
    expect(legOrder("FULL")).toEqual(["ARRIVAL", "DEPARTURE"]);
  });
  it("leads with arrival on ARRIVAL focus", () => {
    expect(legOrder("ARRIVAL")).toEqual(["ARRIVAL", "DEPARTURE"]);
  });
  it("leads with departure on DEPARTURE focus", () => {
    expect(legOrder("DEPARTURE")).toEqual(["DEPARTURE", "ARRIVAL"]);
  });
  it("keeps chronological order on SERVICES focus", () => {
    expect(legOrder("SERVICES")).toEqual(["ARRIVAL", "DEPARTURE"]);
  });
});

describe("hasSecondaryLeg", () => {
  it("is false for FULL (both legs equal weight)", () => {
    expect(hasSecondaryLeg("FULL")).toBe(false);
  });
  it("is true for the specialized focuses", () => {
    expect(hasSecondaryLeg("ARRIVAL")).toBe(true);
    expect(hasSecondaryLeg("DEPARTURE")).toBe(true);
    expect(hasSecondaryLeg("SERVICES")).toBe(true);
  });
});

describe("focusLeads*", () => {
  it("focusLeadsArrival only on ARRIVAL", () => {
    expect(focusLeadsArrival("ARRIVAL")).toBe(true);
    expect(focusLeadsArrival("DEPARTURE")).toBe(false);
    expect(focusLeadsArrival("FULL")).toBe(false);
  });
  it("focusLeadsDeparture only on DEPARTURE", () => {
    expect(focusLeadsDeparture("DEPARTURE")).toBe(true);
    expect(focusLeadsDeparture("ARRIVAL")).toBe(false);
    expect(focusLeadsDeparture("FULL")).toBe(false);
  });
});

describe("nextFlightState", () => {
  it("advances one step along the lifecycle", () => {
    expect(nextFlightState("EXPECTED")).toBe("ON_BLOCKS");
    expect(nextFlightState("PARKED")).toBe("TURNAROUND");
    expect(nextFlightState("BOARDING")).toBe("OFF_BLOCKS");
  });
  it("returns null at the end of the lifecycle", () => {
    expect(nextFlightState("OFF_BLOCKS")).toBeNull();
  });
  it("normalizes legacy states before advancing", () => {
    // ON_GROUND → ON_BLOCKS, so next is PARKED
    expect(nextFlightState("ON_GROUND")).toBe("PARKED");
  });
});

describe("derivePrimaryAction", () => {
  it("FULL focus advances flight state (no leg task short-circuit)", () => {
    const action = derivePrimaryAction("FULL", "PARKED", [task({ direction: "ARRIVAL" })]);
    expect(action).toEqual({ kind: "state", next: "TURNAROUND", label: expect.any(String) });
  });

  it("ARRIVAL focus prefers the first pending arrival task", () => {
    const tasks = [
      task({ type: "PAX_OFF", direction: "ARRIVAL", state: "DONE" }),
      task({ type: "BAGS_OFF", direction: "ARRIVAL", state: "PENDING", label: "Maletas recogidas" }),
      task({ type: "PUSHBACK", direction: "DEPARTURE", state: "PENDING", label: "Pushback" }),
    ];
    const action = derivePrimaryAction("ARRIVAL", "ON_BLOCKS", tasks);
    expect(action).toEqual({ kind: "task", task: tasks[1], label: "Maletas recogidas" });
  });

  it("DEPARTURE focus ignores arrival tasks and picks the departure one", () => {
    const tasks = [
      task({ type: "PAX_OFF", direction: "ARRIVAL", state: "PENDING", label: "Pax recogidos" }),
      task({ type: "SECURITY_PAX", direction: "DEPARTURE", state: "PENDING", label: "Seguridad pax" }),
    ];
    const action = derivePrimaryAction("DEPARTURE", "TURNAROUND", tasks);
    expect(action).toEqual({ kind: "task", task: tasks[1], label: "Seguridad pax" });
  });

  it("falls back to state advance when the focused leg has no pending task", () => {
    const tasks = [task({ direction: "ARRIVAL", state: "DONE" })];
    const action = derivePrimaryAction("ARRIVAL", "EXPECTED", tasks);
    expect(action).toEqual({ kind: "state", next: "ON_BLOCKS", label: expect.any(String) });
  });

  it("SERVICES focus picks any pending task", () => {
    const tasks = [task({ type: "CATERING_LOADED", direction: "DEPARTURE", state: "PENDING", label: "Catering a bordo" })];
    const action = derivePrimaryAction("SERVICES", "PARKED", tasks);
    expect(action).toEqual({ kind: "task", task: tasks[0], label: "Catering a bordo" });
  });

  it("returns null when the flight is closed and no tasks remain", () => {
    expect(derivePrimaryAction("FULL", "OFF_BLOCKS", [])).toBeNull();
  });
});
