import { describe, it, expect } from "vitest";
import {
  parseHHMM,
  computeBarBounds,
  flightPips,
  nowPctInRange,
  zoomedRange,
  isCommercialCallsign,
  barSegments,
  OPS_RANGE,
  minToPct,
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

describe("minToPct (06-24 default range)", () => {
  it("06:00 → 0%", () => expect(minToPct(360)).toBe(0));
  it("24:00 → 100%", () => expect(minToPct(1440)).toBe(100));
  it("15:00 (mediodía+3h) → 50%", () => expect(minToPct(15 * 60)).toBe(50));
});

describe("nowPctInRange", () => {
  it("12:00 UTC → ~33.3% en rango 06-24", () => {
    expect(nowPctInRange(new Date(Date.UTC(2026, 4, 12, 12, 0)))).toBeCloseTo(33.33, 1);
  });
});

describe("zoomedRange", () => {
  it("24h devuelve OPS_RANGE", () => {
    expect(zoomedRange(24)).toEqual(OPS_RANGE);
  });
  it("12h centra en NOW", () => {
    const r = zoomedRange(12, new Date(Date.UTC(2026, 4, 12, 14, 0)));
    expect(r.startMin).toBe(8 * 60);
    expect(r.endMin).toBe(20 * 60);
  });
  it("clampea a 0..1440 cuando NOW esta cerca de los bordes", () => {
    const r = zoomedRange(12, new Date(Date.UTC(2026, 4, 12, 2, 0)));
    expect(r.startMin).toBe(0);
    expect(r.endMin).toBe(12 * 60);
  });
});

describe("computeBarBounds (rango 06-24)", () => {
  const today = "12/05";

  it("vuelo de turnaround (eta+etd hoy en rango)", () => {
    const r = computeBarBounds(
      { eta: "08:00", etd: "12:00", arrivalDate: "12/05/26", departureDate: "12/05/26" },
      today,
    );
    expect(r?.kind).toBe("stay");
    expect(r?.startPct).toBeCloseTo((2 / 18) * 100); // 08-06 = 2h
    expect(r?.endPct).toBeCloseTo((6 / 18) * 100);   // 12-06 = 6h
  });

  it("vuelo overnight que llega ayer y sale hoy: bar desde el inicio del rango", () => {
    const r = computeBarBounds(
      { eta: "20:00", etd: "08:30", arrivalDate: "11/05/26", departureDate: "12/05/26" },
      today,
    );
    expect(r?.startPct).toBe(0);
    expect(r?.endPct).toBeCloseTo((2.5 / 18) * 100); // 8:30 → 2.5h después de 06:00
  });

  it("vuelo que llega antes del rango se filtra (eta 04:00)", () => {
    const r = computeBarBounds(
      { eta: "04:00", etd: "05:00", arrivalDate: "12/05/26", departureDate: "12/05/26" },
      today,
    );
    expect(r).toBeNull();
  });

  it("arrival-only crea bar corto desde ETA", () => {
    const r = computeBarBounds(
      { eta: "10:00", etd: null, arrivalDate: "12/05/26", departureDate: null },
      today,
    );
    expect(r?.kind).toBe("arrival-only");
    expect(r?.startPct).toBeCloseTo((4 / 18) * 100);
  });

  it("overnight que llega hoy y sale mañana: termina al borde del rango", () => {
    const r = computeBarBounds(
      { eta: "22:00", etd: "06:00", arrivalDate: "12/05/26", departureDate: "13/05/26" },
      today,
    );
    expect(r?.startPct).toBeCloseTo((16 / 18) * 100); // 22-06=16h
    expect(r?.endPct).toBe(100);
  });
});

describe("flightPips", () => {
  const bar = { startPct: 20, endPct: 60, kind: "stay" as const };

  it("genera pip de fuel cuando esta REQUESTED, con timestamp", () => {
    const pips = flightPips(
      { fuelState: "REQUESTED", fuelRequestedAt: "10:00", fuelServedAt: null,
        toiletState: "NOT_REQUESTED", toiletRequestedAt: null, toiletCompletedAt: null },
      [],
      bar,
    );
    expect(pips).toHaveLength(1);
    expect(pips[0].letter).toBe("F");
    expect(pips[0].state).toBe("req");
    expect(pips[0].pct).toBeCloseTo((4 / 18) * 100); // 10:00 → 4h despues de 06:00
  });

  it("no genera pip cuando fuel/toilet NOT_REQUESTED y sin servicios", () => {
    const pips = flightPips(
      { fuelState: "NOT_REQUESTED", fuelRequestedAt: null, fuelServedAt: null,
        toiletState: "NOT_REQUESTED", toiletRequestedAt: null, toiletCompletedAt: null },
      [],
      bar,
    );
    expect(pips).toHaveLength(0);
  });

  it("clasifica catering como C y otros servicios como S", () => {
    const pips = flightPips(
      { fuelState: "NOT_REQUESTED", fuelRequestedAt: null, fuelServedAt: null,
        toiletState: "NOT_REQUESTED", toiletRequestedAt: null, toiletCompletedAt: null },
      [
        { type: "CATERING", state: "DELIVERED", arrivedAt: null, deliveredAt: "11:30" },
        { type: "GPU", state: "PENDING", arrivedAt: null, deliveredAt: null },
      ],
      bar,
    );
    expect(pips.find((p) => p.letter === "C")?.state).toBe("ok");
    expect(pips.find((p) => p.letter === "S")?.state).toBe("no");
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
