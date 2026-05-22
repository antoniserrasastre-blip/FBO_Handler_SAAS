import { describe, it, expect } from "vitest";
import {
  parseHHMM,
  computeBarBounds,
  flightPips,
  nowPctInRange,
  rangeFromCenter,
  isCommercialCallsign,
  barSegments,
  msToPct,
  rulerTicks,
  palmaDaysInRange,
  HOUR_MS,
  DAY_MS,
} from "./timelineHelpers";

describe("parseHHMM", () => {
  it("parses valid HH:MM", () => {
    expect(parseHHMM("06:30")).toBe(390);
    expect(parseHHMM("00:00")).toBe(0);
    expect(parseHHMM("23:59")).toBe(1439);
  });
  it("rejects invalid input", () => {
    expect(parseHHMM(null)).toBeNull();
    expect(parseHHMM("ab:cd")).toBeNull();
    expect(parseHHMM("25:00")).toBeNull();
  });
});

describe("rangeFromCenter", () => {
  it("centra y reparte la ventana", () => {
    const centerMs = Date.UTC(2026, 4, 12, 12, 0);
    const r = rangeFromCenter(centerMs, 24 * HOUR_MS);
    expect(r.startMs).toBe(centerMs - 12 * HOUR_MS);
    expect(r.endMs).toBe(centerMs + 12 * HOUR_MS);
  });
});

describe("msToPct", () => {
  it("startMs → 0%, endMs → 100%, midpoint → 50%", () => {
    const range = { startMs: 1000, endMs: 2000 };
    expect(msToPct(1000, range)).toBe(0);
    expect(msToPct(2000, range)).toBe(100);
    expect(msToPct(1500, range)).toBe(50);
  });
});

describe("nowPctInRange", () => {
  it("now en el centro → ~50%", () => {
    const center = Date.UTC(2026, 4, 12, 12, 0);
    const range = rangeFromCenter(center, 24 * HOUR_MS);
    expect(nowPctInRange(new Date(center), range)).toBeCloseTo(50, 1);
  });
});

describe("computeBarBounds (eje absoluto)", () => {
  const center = Date.UTC(2026, 4, 12, 12, 0); // 12:00 UTC 12/05/2026
  const range = rangeFromCenter(center, 24 * HOUR_MS); // [00:00, 24:00] del dia 12/05

  it("turnaround con arrival e departure dentro del rango", () => {
    const arr = new Date(Date.UTC(2026, 4, 12, 8, 0));
    const dep = new Date(Date.UTC(2026, 4, 12, 14, 0));
    const r = computeBarBounds({ arrivalInstant: arr, departureInstant: dep }, range);
    expect(r?.kind).toBe("stay");
    expect(r?.startPct).toBeCloseTo(((8 - 0) / 24) * 100);
    expect(r?.endPct).toBeCloseTo(((14 - 0) / 24) * 100);
  });

  it("vuelo overnight cruza medianoche en una ventana suficientemente ancha", () => {
    const arr = new Date(Date.UTC(2026, 4, 12, 22, 0));
    const dep = new Date(Date.UTC(2026, 4, 13, 8, 30));
    // Ventana de 48h centrada en 12:00 del 12/05 → [12/05 12:00, 13/05 12:00 +12h]
    const wide = rangeFromCenter(center, 48 * HOUR_MS);
    const r = computeBarBounds({ arrivalInstant: arr, departureInstant: dep }, wide);
    expect(r).not.toBeNull();
    // Bar entero dentro del rango — startPct < endPct, ambos en (0, 100)
    expect(r!.startPct).toBeGreaterThan(0);
    expect(r!.endPct).toBeLessThan(100);
    expect(r!.startPct).toBeLessThan(r!.endPct);
  });

  it("vuelo fuera del rango devuelve null", () => {
    const arr = new Date(Date.UTC(2026, 4, 10, 8, 0));
    const dep = new Date(Date.UTC(2026, 4, 10, 14, 0));
    const r = computeBarBounds({ arrivalInstant: arr, departureInstant: dep }, range);
    expect(r).toBeNull();
  });

  it("arrival-only crea bar de 90 min desde ETA", () => {
    const arr = new Date(Date.UTC(2026, 4, 12, 10, 0));
    const r = computeBarBounds({ arrivalInstant: arr, departureInstant: null }, range);
    expect(r?.kind).toBe("arrival-only");
    expect(r?.endMs).toBe(arr.getTime() + 90 * 60 * 1000);
  });

  it("departure-only crea bar de 90 min hasta ETD", () => {
    const dep = new Date(Date.UTC(2026, 4, 12, 16, 0));
    const r = computeBarBounds({ arrivalInstant: null, departureInstant: dep }, range);
    expect(r?.kind).toBe("departure-only");
    expect(r?.startMs).toBe(dep.getTime() - 90 * 60 * 1000);
  });
});

describe("flightPips", () => {
  const center = Date.UTC(2026, 4, 12, 12, 0);
  const range = rangeFromCenter(center, 24 * HOUR_MS);
  const arrivalInstant = new Date(Date.UTC(2026, 4, 12, 8, 0));
  const departureInstant = new Date(Date.UTC(2026, 4, 12, 14, 0));
  const bar = {
    startPct: (8 / 24) * 100,
    endPct: (14 / 24) * 100,
    startMs: arrivalInstant.getTime(),
    endMs: departureInstant.getTime(),
    kind: "stay" as const,
  };

  it("ancla pip de fuel HH:MM al dia del vuelo", () => {
    const pips = flightPips(
      {
        fuelState: "REQUESTED",
        fuelRequestedAt: "10:00",
        fuelServedAt: null,
        toiletState: "NOT_REQUESTED",
        toiletRequestedAt: null,
        toiletCompletedAt: null,
        arrivalInstant,
        departureInstant,
      },
      [],
      bar,
      range,
    );
    expect(pips).toHaveLength(1);
    expect(pips[0].letter).toBe("F");
    expect(pips[0].state).toBe("req");
    expect(pips[0].pct).toBeCloseTo((10 / 24) * 100);
  });

  it("no genera pip cuando todo es NOT_REQUESTED", () => {
    const pips = flightPips(
      {
        fuelState: "NOT_REQUESTED",
        fuelRequestedAt: null,
        fuelServedAt: null,
        toiletState: "NOT_REQUESTED",
        toiletRequestedAt: null,
        toiletCompletedAt: null,
        arrivalInstant,
        departureInstant,
      },
      [],
      bar,
      range,
    );
    expect(pips).toHaveLength(0);
  });

  it("clasifica catering como C y otros servicios como S", () => {
    const pips = flightPips(
      {
        fuelState: "NOT_REQUESTED",
        fuelRequestedAt: null,
        fuelServedAt: null,
        toiletState: "NOT_REQUESTED",
        toiletRequestedAt: null,
        toiletCompletedAt: null,
        arrivalInstant,
        departureInstant,
      },
      [
        { type: "CATERING", state: "DELIVERED", arrivedAt: null, deliveredAt: "11:30" },
        { type: "GPU", state: "PENDING", arrivedAt: null, deliveredAt: null },
      ],
      bar,
      range,
    );
    expect(pips.find((p) => p.letter === "C")?.state).toBe("ok");
    expect(pips.find((p) => p.letter === "S")?.state).toBe("no");
  });
});

describe("rulerTicks", () => {
  it("genera 1 tick por hora dentro de la ventana", () => {
    const start = Date.UTC(2026, 4, 12, 10, 0);
    const ticks = rulerTicks({ startMs: start, endMs: start + 3 * HOUR_MS }, 1);
    expect(ticks.map((t) => t.hour)).toEqual([10, 11, 12, 13]);
  });

  it("marca isMidnight para 00:00 UTC", () => {
    const start = Date.UTC(2026, 4, 12, 22, 0);
    const ticks = rulerTicks({ startMs: start, endMs: start + 4 * HOUR_MS }, 1);
    expect(ticks.find((t) => t.hour === 0)?.isMidnight).toBe(true);
  });
});

describe("palmaDaysInRange", () => {
  it("incluye los dias cubiertos con un margen de ±1 dia", () => {
    const center = Date.UTC(2026, 4, 12, 12, 0);
    const days = palmaDaysInRange(rangeFromCenter(center, 12 * HOUR_MS));
    // Centro 12/05, ventana ±6h, margen ±1d → debe incluir 11, 12 y 13.
    expect(days).toContain("2026-05-11");
    expect(days).toContain("2026-05-12");
    expect(days).toContain("2026-05-13");
  });

  it("ventana ancha cubre mas dias", () => {
    const center = Date.UTC(2026, 4, 12, 12, 0);
    const days = palmaDaysInRange(rangeFromCenter(center, 48 * HOUR_MS));
    expect(days.length).toBeGreaterThanOrEqual(4);
  });
});

describe("isCommercialCallsign", () => {
  it("RYR/VLG/EZY → comercial", () => {
    expect(isCommercialCallsign("RYR4521")).toBe(true);
    expect(isCommercialCallsign("VLG3287")).toBe(true);
    expect(isCommercialCallsign("EZY123")).toBe(true);
  });
  it("matricula privada → no comercial", () => {
    expect(isCommercialCallsign("ECMJI")).toBe(false);
    expect(isCommercialCallsign("N782JK")).toBe(false);
  });
});

describe("barSegments (5-state)", () => {
  it("ARRIVING / PARKED → turn-parked", () => {
    expect(barSegments("ARRIVING", false)).toEqual(["turn-parked"]);
    expect(barSegments("PARKED", false)).toEqual(["turn-parked"]);
  });
  it("DEPARTING sin boarded → solo turn-svc", () => {
    expect(barSegments("DEPARTING", false)).toEqual(["turn-svc"]);
  });
  it("DEPARTING con paxBoarded → svc + board", () => {
    expect(barSegments("DEPARTING", true)).toEqual(["turn-svc", "turn-board"]);
  });
});

describe("DAY_MS constant", () => {
  it("es 24h en ms", () => {
    expect(DAY_MS).toBe(24 * HOUR_MS);
  });
});
