import { describe, it, expect } from "vitest";
import {
  signedDelay,
  computePunctuality,
  computePaxAccuracy,
  computeForecast,
  pctChange,
  FORECAST_MIN_DAYS,
} from "./metrics";

describe("signedDelay", () => {
  it("computes positive delay (late)", () => {
    expect(signedDelay("10:00", "10:20")).toBe(20);
  });
  it("computes negative delay (early)", () => {
    expect(signedDelay("10:00", "09:45")).toBe(-15);
  });
  it("handles midnight wrap (scheduled 23:50, actual 00:10 = +20)", () => {
    expect(signedDelay("23:50", "00:10")).toBe(20);
  });
  it("handles wrap the other way (scheduled 00:05, actual 23:55 = -10)", () => {
    expect(signedDelay("00:05", "23:55")).toBe(-10);
  });
  it("returns null for malformed input", () => {
    expect(signedDelay("abc", "10:00")).toBeNull();
  });
});

describe("computePunctuality", () => {
  it("returns zeros when nothing measurable", () => {
    const r = computePunctuality([{ direction: "ARRIVAL", eta: "10:00" }]);
    expect(r.measured).toBe(0);
    expect(r.onTimeRate).toBe(0);
  });

  it("classifies on-time, late and early correctly", () => {
    const r = computePunctuality([
      { direction: "ARRIVAL", eta: "10:00", ata: "10:05" }, // on time
      { direction: "DEPARTURE", etd: "12:00", atd: "12:45" }, // 30-60
      { direction: "ARRIVAL", eta: "08:00", ata: "07:30" }, // early
      { direction: "DEPARTURE", etd: "15:00", atd: "16:10" }, // +60
      { direction: "DEPARTURE", etd: "18:00", atd: "18:20" }, // 15-30
    ]);
    expect(r.measured).toBe(5);
    expect(r.distribution.onTime).toBe(1);
    expect(r.distribution.early).toBe(1);
    expect(r.distribution.d15_30).toBe(1);
    expect(r.distribution.d30_60).toBe(1);
    expect(r.distribution.d60plus).toBe(1);
    // on-time = delay <= 15 → the on-time one + the early one = 2
    expect(r.onTime).toBe(2);
    expect(r.onTimeRate).toBe(40);
  });

  it("separates arrival and departure averages", () => {
    const r = computePunctuality([
      { direction: "ARRIVAL", eta: "10:00", ata: "10:10" }, // +10
      { direction: "ARRIVAL", eta: "11:00", ata: "11:30" }, // +30
      { direction: "DEPARTURE", etd: "12:00", atd: "11:50" }, // -10
    ]);
    expect(r.arrival.measured).toBe(2);
    expect(r.arrival.avgDelay).toBe(20);
    expect(r.departure.measured).toBe(1);
    expect(r.departure.avgDelay).toBe(-10);
  });
});

describe("computePaxAccuracy", () => {
  it("ignores legs without real counts", () => {
    const r = computePaxAccuracy([
      { paxArrival: 4, paxArrivalReal: null, paxDeparture: 3, paxDepartureReal: null },
    ]);
    expect(r.measured).toBe(0);
    expect(r.avgAbsDeviation).toBe(0);
  });

  it("computes deviation, exact rate and over/under counts", () => {
    const r = computePaxAccuracy([
      { paxArrival: 4, paxArrivalReal: 4, paxDeparture: 3, paxDepartureReal: 5 }, // exact, under(+2)
      { paxArrival: 6, paxArrivalReal: 4, paxDeparture: 2, paxDepartureReal: 2 }, // over(-2), exact
    ]);
    expect(r.measured).toBe(4);
    expect(r.exact).toBe(2);
    expect(r.under).toBe(1);
    expect(r.over).toBe(1);
    expect(r.avgAbsDeviation).toBe(1); // (0 + 2 + 2 + 0) / 4
    expect(r.exactRate).toBe(50);
    expect(r.sumEstimate).toBe(15);
    expect(r.sumReal).toBe(15);
  });
});

describe("computeForecast", () => {
  it("does not forecast with insufficient data", () => {
    const r = computeForecast([], 5);
    expect(r.enough).toBe(false);
    expect(r.days).toHaveLength(0);
  });

  it("produces 7 weekday-seasonal days when enough data", () => {
    // 28 days of synthetic data, anchored so getUTCDay is stable.
    const base = new Date("2024-01-01T00:00:00Z"); // lunes
    const daily = Array.from({ length: 28 }, (_, i) => {
      const date = new Date(base);
      date.setUTCDate(base.getUTCDate() + i);
      // fines de semana con más vuelos para que la estacionalidad sea visible
      const dow = date.getUTCDay();
      const flights = dow === 0 || dow === 6 ? 20 : 8;
      return { date, flights, paxTotal: flights * 3 };
    });
    const now = new Date("2024-01-29T00:00:00Z");
    const r = computeForecast(daily, daily.length, now);
    expect(r.enough).toBe(true);
    expect(r.days).toHaveLength(7);
    // cada día tiene etiqueta de día de semana y conteos no negativos
    for (const d of r.days) {
      expect(d.flights).toBeGreaterThanOrEqual(0);
      expect(["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"]).toContain(d.weekday);
    }
    // un sábado/domingo debe estimar más vuelos que un día laborable
    const weekend = r.days.find((d) => d.weekday === "Sab" || d.weekday === "Dom");
    const weekday = r.days.find((d) => d.weekday === "Mar");
    if (weekend && weekday) expect(weekend.flights).toBeGreaterThan(weekday.flights);
  });

  it("respects the minimum-days threshold constant", () => {
    const r = computeForecast([], FORECAST_MIN_DAYS - 1);
    expect(r.enough).toBe(false);
  });
});

describe("pctChange", () => {
  it("returns null when previous is zero and current is positive", () => {
    expect(pctChange(5, 0)).toBeNull();
  });
  it("returns 0 when both are zero", () => {
    expect(pctChange(0, 0)).toBe(0);
  });
  it("computes percentage change rounded to 1 decimal", () => {
    expect(pctChange(150, 100)).toBe(50);
    expect(pctChange(90, 100)).toBe(-10);
  });
});
