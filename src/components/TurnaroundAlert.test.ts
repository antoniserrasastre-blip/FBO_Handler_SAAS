import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getTurnaroundAlerts } from "./TurnaroundAlert";

function makeFlight(overrides: Record<string, unknown> = {}) {
  return {
    id: "f1",
    callsign: "ABC123",
    state: "EXPECTED",
    eta: null,
    etd: null,
    services: [],
    ...overrides,
  } as unknown as Parameters<typeof getTurnaroundAlerts>[0][number];
}

describe("getTurnaroundAlerts (UTC handling)", () => {
  beforeEach(() => {
    // 2024-07-01T12:30:00Z — in Palma (CEST = UTC+2) this is 14:30 local.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-07-01T12:30:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("treats flight eta as Zulu and computes minutesLeft against UTC now", () => {
    // ETA 13:00 Zulu, now is 12:30 Zulu → 30 min until arrival
    const alerts = getTurnaroundAlerts([
      makeFlight({ id: "f1", state: "EXPECTED", eta: "13:00" }),
    ]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].kind).toBe("ARRIVAL");
    expect(alerts[0].minutesLeft).toBe(30);
  });

  it("does NOT use local hours (would give -90 min instead of +30 min)", () => {
    const alerts = getTurnaroundAlerts([
      makeFlight({ id: "f1", state: "EXPECTED", eta: "13:00" }),
    ]);
    // If broken (local): h=14, minutesUntilArrival = 13*60 - 14*60 - 30 = -90
    expect(alerts[0].minutesLeft).not.toBe(-90);
  });
});
