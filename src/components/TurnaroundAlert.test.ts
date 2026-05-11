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

describe("getTurnaroundAlerts (date wraparound regression)", () => {
  beforeEach(() => {
    // 2026-05-11 23:35 UTC — the exact moment the bug was reported.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-11T23:35:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does NOT alert for tomorrow's morning flight as 1000+ min late", () => {
    // ETA 06:10 Zulu on May 12. With dayUtc anchor: ~6h35 in the future,
    // outside the [-30, +30] alert window → no alert.
    const dayUtc = new Date(Date.UTC(2026, 4, 12, 0, 0, 0));
    const alerts = getTurnaroundAlerts(
      [makeFlight({ id: "f1", state: "EXPECTED", eta: "06:10" })],
      dayUtc,
    );
    expect(alerts).toHaveLength(0);
  });

  it("does not alert for tomorrow's morning flight even without dayUtc (heuristic)", () => {
    // Sin anchor, el heuristico ±12h también debería evitar el alerta.
    const alerts = getTurnaroundAlerts([
      makeFlight({ id: "f1", state: "EXPECTED", eta: "06:10" }),
    ]);
    expect(alerts).toHaveLength(0);
  });

  it("does alert when ETA is within 30 min in the future", () => {
    const dayUtc = new Date(Date.UTC(2026, 4, 11, 0, 0, 0));
    const alerts = getTurnaroundAlerts(
      [makeFlight({ id: "f1", state: "EXPECTED", eta: "23:50" })], // 15 min ahead
      dayUtc,
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0].minutesLeft).toBe(15);
  });

  it("does alert when ETA was 20 min ago (within -30 window)", () => {
    const dayUtc = new Date(Date.UTC(2026, 4, 11, 0, 0, 0));
    const alerts = getTurnaroundAlerts(
      [makeFlight({ id: "f1", state: "EXPECTED", eta: "23:15" })], // 20 min past
      dayUtc,
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0].minutesLeft).toBe(-20);
  });
});
