import { describe, it, expect } from "vitest";
import { parseHHMM, computeBarBounds, flightPips, nowZuluPercent } from "./timelineHelpers";

describe("parseHHMM", () => {
  it("parses valid HH:MM", () => {
    expect(parseHHMM("06:30")).toBe(390);
    expect(parseHHMM("00:00")).toBe(0);
    expect(parseHHMM("23:59")).toBe(1439);
  });
  it("rejects invalid input", () => {
    expect(parseHHMM(null)).toBeNull();
    expect(parseHHMM("")).toBeNull();
    expect(parseHHMM("ab:cd")).toBeNull();
    expect(parseHHMM("25:00")).toBeNull();
    expect(parseHHMM("12:60")).toBeNull();
  });
});

describe("nowZuluPercent", () => {
  it("converts UTC time to 0..100 percent", () => {
    expect(nowZuluPercent(new Date(Date.UTC(2026, 4, 12, 0, 0)))).toBe(0);
    expect(nowZuluPercent(new Date(Date.UTC(2026, 4, 12, 12, 0)))).toBe(50);
    expect(nowZuluPercent(new Date(Date.UTC(2026, 4, 12, 6, 0)))).toBe(25);
  });
});

describe("computeBarBounds", () => {
  const today = "12/05";

  it("returns null when no eta and no etd", () => {
    expect(computeBarBounds({ eta: null, etd: null, arrivalDate: null, departureDate: null }, today)).toBeNull();
  });

  it("full stay (arr+dep today): bar from eta to etd", () => {
    const r = computeBarBounds(
      { eta: "06:00", etd: "12:00", arrivalDate: "12/05/26", departureDate: "12/05/26" },
      today,
    );
    expect(r?.kind).toBe("stay");
    expect(r?.startPct).toBeCloseTo(25);
    expect(r?.endPct).toBeCloseTo(50);
  });

  it("overnight arrived yesterday, leaves today: bar from 0 to etd", () => {
    const r = computeBarBounds(
      { eta: "16:00", etd: "08:30", arrivalDate: "11/05/26", departureDate: "12/05/26" },
      today,
    );
    expect(r?.startPct).toBe(0);
    expect(r?.endPct).toBeCloseTo(8.5 / 24 * 100);
  });

  it("overnight arrives today, leaves tomorrow: bar from eta to 100", () => {
    const r = computeBarBounds(
      { eta: "20:00", etd: "06:00", arrivalDate: "12/05/26", departureDate: "13/05/26" },
      today,
    );
    expect(r?.startPct).toBeCloseTo(20 / 24 * 100);
    expect(r?.endPct).toBe(100);
  });

  it("arrival-only today (no etd): short bar from eta", () => {
    const r = computeBarBounds(
      { eta: "10:00", etd: null, arrivalDate: "12/05/26", departureDate: null },
      today,
    );
    expect(r?.kind).toBe("arrival-only");
    expect(r?.startPct).toBeCloseTo(10 / 24 * 100);
    expect(r?.endPct).toBeCloseTo((10 / 24 + 1.5 / 24) * 100); // +90 min
  });

  it("departure-only today (no eta): short bar before etd", () => {
    const r = computeBarBounds(
      { eta: null, etd: "14:00", arrivalDate: null, departureDate: "12/05/26" },
      today,
    );
    expect(r?.kind).toBe("departure-only");
    expect(r?.endPct).toBeCloseTo(14 / 24 * 100);
    expect(r?.startPct).toBeCloseTo((14 / 24 - 1.5 / 24) * 100);
  });

  it("enforces min bar width when etd very close to eta", () => {
    const r = computeBarBounds(
      { eta: "10:00", etd: "10:05", arrivalDate: "12/05/26", departureDate: "12/05/26" },
      today,
    );
    expect((r?.endPct ?? 0) - (r?.startPct ?? 0)).toBeGreaterThanOrEqual(1.5);
  });
});

describe("flightPips", () => {
  it("converts timestamps to pips with correct percent", () => {
    const pips = flightPips(
      { fuelRequestedAt: "10:00", fuelServedAt: "10:30", toiletRequestedAt: null, toiletCompletedAt: null },
      [{ type: "CATERING", arrivedAt: "11:00", deliveredAt: "11:15" }],
    );
    expect(pips).toHaveLength(4);
    const fuelReq = pips.find((p) => p.kind === "fuel-req");
    expect(fuelReq?.pct).toBeCloseTo(10 / 24 * 100);
    const svcDelivered = pips.find((p) => p.kind === "svc-delivered");
    expect(svcDelivered?.pct).toBeCloseTo(11.25 / 24 * 100);
  });

  it("ignores null timestamps", () => {
    const pips = flightPips(
      { fuelRequestedAt: null, fuelServedAt: null, toiletRequestedAt: null, toiletCompletedAt: null },
      [],
    );
    expect(pips).toHaveLength(0);
  });
});
