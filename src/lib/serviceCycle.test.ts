import { describe, it, expect } from "vitest";
import { nextServiceState, pipStateFor } from "@/lib/serviceCycle";

describe("nextServiceState", () => {
  it("advances PENDING → ARRIVED", () => {
    expect(nextServiceState("PENDING")).toBe("ARRIVED");
  });
  it("advances ARRIVED → DELIVERED", () => {
    expect(nextServiceState("ARRIVED")).toBe("DELIVERED");
  });
  it("wraps DELIVERED → PENDING", () => {
    // Mistakes happen — the handler ticks DELIVERED early, then needs to
    // walk it back. Single-click reset is the cheapest UX.
    expect(nextServiceState("DELIVERED")).toBe("PENDING");
  });
  it("treats unknown / legacy states as PENDING start", () => {
    expect(nextServiceState("")).toBe("PENDING");
    expect(nextServiceState("NOT_REQUESTED")).toBe("PENDING");
  });
});

describe("pipStateFor", () => {
  it("DELIVERED maps to the ok pip", () => {
    expect(pipStateFor("DELIVERED")).toBe("ok");
  });
  it("ARRIVED maps to the requested/intermediate pip", () => {
    expect(pipStateFor("ARRIVED")).toBe("req");
  });
  it("anything else maps to the not-requested pip", () => {
    expect(pipStateFor("PENDING")).toBe("no");
    expect(pipStateFor("")).toBe("no");
  });
});
