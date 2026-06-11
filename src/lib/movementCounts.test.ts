import { describe, it, expect } from "vitest";
import { countMovements, isArrivalOn, isDepartureOn } from "./movementCounts";

const DAY = "11/06";

describe("isArrivalOn / isDepartureOn — criterio solo-fecha (B3)", () => {
  it("matches by stored date, without requiring eta/etd", () => {
    // Sin hora: sigue siendo un movimiento del día (la cabecera antigua lo
    // descartaba por exigir eta/etd → 34 vs 36).
    expect(isArrivalOn({ arrivalDate: "11/06" }, DAY)).toBe(true);
    expect(isDepartureOn({ departureDate: "11/06" }, DAY)).toBe(true);
  });

  it("rejects legs stored on another day", () => {
    expect(isArrivalOn({ arrivalDate: "10/06" }, DAY)).toBe(false);
    expect(isDepartureOn({ departureDate: "12/06" }, DAY)).toBe(false);
  });

  it("accepts both DD/MM and DD/MM/YY on either side", () => {
    expect(isArrivalOn({ arrivalDate: "11/06/26" }, DAY)).toBe(true);
    expect(isArrivalOn({ arrivalDate: "11/06" }, "11/06/26")).toBe(true);
    expect(isDepartureOn({ departureDate: "11/06/26" }, "11/06/26")).toBe(true);
  });

  it("assumes the viewed day when the date is missing BUT the leg has evidence (legacy data)", () => {
    // Política única: misma asunción que diaHelpers y TurnaroundAlert, pero
    // solo si hay rastro real del leg (hora estimada/real o aeropuerto).
    expect(isArrivalOn({ arrivalDate: null, eta: "10:30" }, DAY)).toBe(true);
    expect(isArrivalOn({ arrivalDate: null, ata: "10:42" }, DAY)).toBe(true);
    expect(isArrivalOn({ arrivalDate: null, origin: "LFPB" }, DAY)).toBe(true);
    expect(isDepartureOn({ etd: "16:00" }, DAY)).toBe(true);
    expect(isDepartureOn({ atd: "16:12" }, DAY)).toBe(true);
    expect(isDepartureOn({ destination: "EGGW" }, DAY)).toBe(true);
  });

  it("does NOT invent a leg when the date is missing and there is no evidence", () => {
    // Regresión: un quick-add manual solo-salida (POST /api/flights crea Visit
    // + solo movement DEPARTURE) deja arrivalDate=null, eta=null, origin=null.
    // El fallback antiguo lo contaba como LLEGADA fantasma del día.
    const quickAddDepartureOnly = {
      arrivalDate: null,
      eta: null,
      ata: null,
      origin: null,
      departureDate: "11/06",
      etd: "15:00",
      destination: "LEVT",
    };
    expect(isArrivalOn(quickAddDepartureOnly, DAY)).toBe(false);
    expect(isDepartureOn(quickAddDepartureOnly, DAY)).toBe(true);
    // Y simétrico: sin leg de salida, no hay salida fantasma.
    expect(isDepartureOn({ arrivalDate: "11/06", eta: "09:00" }, DAY)).toBe(false);
    // Objeto totalmente vacío: ningún movimiento.
    expect(isArrivalOn({}, DAY)).toBe(false);
    expect(isDepartureOn({}, DAY)).toBe(false);
  });
});

describe("countMovements", () => {
  it("counts arrivals and departures independently per leg date", () => {
    const flights = [
      // Turnaround del día: cuenta en ambos.
      { arrivalDate: "11/06", departureDate: "11/06" },
      // Pernocta que llegó ayer y sale hoy: solo salida.
      { arrivalDate: "10/06", departureDate: "11/06" },
      // Llegada de hoy que sale mañana: solo llegada.
      { arrivalDate: "11/06", departureDate: "12/06" },
      // Salida placeholder sin ETD pero con fecha de hoy: cuenta como salida.
      { arrivalDate: "11/06", departureDate: "11/06/26" },
    ];
    expect(countMovements(flights, DAY)).toEqual({ arrivals: 3, departures: 3 });
  });

  it("returns zeros for an empty list", () => {
    expect(countMovements([], DAY)).toEqual({ arrivals: 0, departures: 0 });
  });

  it("a quick-add departure-only visit counts as 1 salida and 0 llegadas", () => {
    // Regresión del fallback fantasma: sin fecha NI evidencia de llegada, el
    // movimiento ARRIVAL no existe y no debe sumar al banner de LLEGADAS.
    const flights = [
      { arrivalDate: null, eta: null, ata: null, origin: null, departureDate: "11/06", etd: "15:00" },
    ];
    expect(countMovements(flights, DAY)).toEqual({ arrivals: 0, departures: 1 });
  });
});
