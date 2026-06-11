import { describe, it, expect } from "vitest";
import { splitByDirection } from "./CompactFlightGrid";

type GridFlightArg = Parameters<typeof splitByDirection>[0][number];

function makeFlight(overrides: Record<string, unknown> = {}): GridFlightArg {
  return {
    id: "f1",
    registration: "EC-AAA",
    state: "EXPECTED",
    eta: null,
    etd: null,
    arrivalDate: "01/07",
    departureDate: "01/07",
    services: [],
    ...overrides,
  } as unknown as GridFlightArg;
}

const DAY = "01/07";

describe("splitByDirection — pertenencia a zonas", () => {
  it("an overnight that arrived another day shows only in SALIDAS", () => {
    const { ARR, DEP } = splitByDirection(
      [makeFlight({ id: "f1", arrivalDate: "30/06", departureDate: "01/07", etd: "10:00" })],
      DAY,
    );
    expect(ARR).toHaveLength(0);
    expect(DEP.map((f) => f.id)).toEqual(["f1"]);
  });

  it("a same-day turnaround shows in both zones", () => {
    const { ARR, DEP } = splitByDirection(
      [makeFlight({ id: "f1", eta: "08:00", etd: "11:00" })],
      DAY,
    );
    expect(ARR).toHaveLength(1);
    expect(DEP).toHaveLength(1);
  });

  it("B2b: a visit with an empty DEPARTURE (no etd) is NOT a salida", () => {
    // El reimport deja placeholders de DEPARTURE con fecha pero sin hora ni
    // destino: no son salidas operables y no deben aparecer en la zona SALIDAS.
    const { ARR, DEP } = splitByDirection(
      [makeFlight({ id: "f1", eta: "08:00", etd: null, departureDate: "01/07" })],
      DAY,
    );
    expect(ARR).toHaveLength(1);
    expect(DEP).toHaveLength(0);
  });

  it("a manual quick-add with only a DEPARTURE leg does NOT show in LLEGADAS", () => {
    // Regresión: POST /api/flights (quick add) crea Visit + solo movement
    // DEPARTURE → arrivalDate=null, eta=null, origin=null. El fallback
    // "sin fecha → día visualizado" lo pintaba como chip fantasma en LLEGADAS.
    const { ARR, DEP } = splitByDirection(
      [
        makeFlight({
          id: "quickAdd",
          arrivalDate: null,
          eta: null,
          ata: null,
          origin: null,
          departureDate: "01/07",
          etd: "15:00",
        }),
      ],
      DAY,
    );
    expect(ARR).toHaveLength(0);
    expect(DEP.map((f) => f.id)).toEqual(["quickAdd"]);
  });
});

describe("splitByDirection — orden por la hora del propio leg (B6)", () => {
  it("orders LLEGADAS by eta (fallback etd)", () => {
    const { ARR } = splitByDirection(
      [
        makeFlight({ id: "late", eta: "14:00", etd: "16:00" }),
        makeFlight({ id: "noEta", eta: null, etd: "09:30" }),
        makeFlight({ id: "early", eta: "07:15", etd: "18:00" }),
      ],
      DAY,
    );
    expect(ARR.map((f) => f.id)).toEqual(["early", "noEta", "late"]);
  });

  it("orders SALIDAS by etd even when the eta order disagrees", () => {
    const { DEP } = splitByDirection(
      [
        makeFlight({ id: "depLate", eta: "06:00", etd: "20:00" }),
        makeFlight({ id: "depEarly", eta: "12:00", etd: "13:00" }),
      ],
      DAY,
    );
    expect(DEP.map((f) => f.id)).toEqual(["depEarly", "depLate"]);
  });

  it("flights without any time sort last", () => {
    const { ARR } = splitByDirection(
      [
        makeFlight({ id: "noTime", eta: null, etd: null }),
        makeFlight({ id: "timed", eta: "10:00" }),
      ],
      DAY,
    );
    expect(ARR.map((f) => f.id)).toEqual(["timed", "noTime"]);
  });
});
