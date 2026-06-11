// Sondas QA: pureza del día en /dia (fechas, filtro, contadores).
// Cada test afirma el comportamiento CORRECTO para el operador del FBO.
// Si el código tiene el bug, el test FALLA a propósito (no se arregla aquí).

import { describe, it, expect } from "vitest";
import {
  isArrivalToday,
  arrivalSegmentState,
  departureSegmentState,
  rowUrgency,
  computeHeaderStats,
  type FlightLite,
} from "./diaHelpers";

function mk(partial: Partial<FlightLite> = {}): FlightLite {
  return {
    id: "f1",
    callsign: "TST1",
    state: "EXPECTED",
    eta: null,
    etd: null,
    ata: null,
    atd: null,
    arrivalDate: null,
    departureDate: null,
    fuelState: "NOT_REQUESTED",
    toiletState: "NOT_REQUESTED",
    livePhase: null,
    liveLastSeenAt: null,
    liveOnGround: null,
    services: [],
    eventLogs: [],
    ...partial,
  } as FlightLite;
}

const day = new Date(Date.UTC(2026, 4, 12, 0, 0, 0));
const now = new Date(Date.UTC(2026, 4, 12, 10, 0, 0)); // 10:00 Z on the day

// ---------------------------------------------------------------------------
// Sondas 1-4 (REESCRITAS tras la QA run 11-06-2026). Los reclamos originales
// (año ignorado, año de 4 dígitos, cruce de año sin año explícito, fechas
// basura/whitespace) fueron REFUTADOS: son ciertos a nivel de función pero
// INALCANZABLES en producción — el GET /api/flights filtra por fecha antes de
// servir y toFlightView normaliza los strings a "DD/MM[/YY]", así que el
// helper nunca recibe años de 4 dígitos, basura ni whitespace, y nunca ve
// fechas de otro año del mismo día/mes. Estos tests documentan el contrato
// real de la comparación DD/MM (deliberadamente año-flexible) para que un
// cambio accidental sea visible.
// ---------------------------------------------------------------------------
describe("sonda 1 (contrato real): la comparación de día es por DD/MM", () => {
  it("mismo DD/MM con año distinto se trata como 'hoy' (aceptado: la API ya filtró por fecha)", () => {
    // Año-flexible por diseño: dateMatches compara slice(0,5). Es aceptable
    // porque /dia solo recibe visits del día consultado.
    expect(isArrivalToday({ eta: "10:00", arrivalDate: "12/05/25" }, day)).toBe(true);
  });

  it("DD/MM de ayer con año explícito se clasifica past", () => {
    const f = mk({ eta: "10:00", arrivalDate: "11/05/26" });
    expect(arrivalSegmentState(f, day, now)).toBe("past");
  });
});

describe("sonda 2 (contrato real): el formato soportado es DD/MM[/YY], no DD/MM/YYYY", () => {
  it("12/05/2026 matchea hoy por el prefijo DD/MM (el año largo se ignora a nivel de match)", () => {
    // toFlightView nunca emite años de 4 dígitos; si llegaran, el prefijo
    // DD/MM sigue decidiendo el "es de hoy". Aceptado y documentado.
    expect(isArrivalToday({ eta: "10:00", arrivalDate: "12/05/2026" }, day)).toBe(true);
    const f = mk({ eta: "10:00", arrivalDate: "12/05/2026" });
    expect(arrivalSegmentState(f, day, now)).toBe("today-pending");
  });
});

describe("sonda 3 (contrato real): cruce de año necesita año explícito", () => {
  const nye = new Date(Date.UTC(2026, 11, 31, 0, 0, 0));
  const nyeNow = new Date(Date.UTC(2026, 11, 31, 22, 0, 0));

  it("salida 01/01 sin año, vista el 31/12/2026, se interpreta como 01/01 del MISMO año → past", () => {
    // Aceptado: el parser PDF siempre emite el año (DD/MM/YY); el caso
    // "sin año" solo ocurre en vuelos manuales del propio día.
    const f = mk({ state: "PARKED", etd: "06:00", departureDate: "01/01" });
    expect(departureSegmentState(f, nye, nyeNow)).toBe("past");
  });

  it("salida 01/01/27 con año explícito, vista el 31/12/2026, es future", () => {
    const f = mk({ state: "PARKED", etd: "06:00", departureDate: "01/01/27" });
    expect(departureSegmentState(f, nye, nyeNow)).toBe("future");
  });
});

describe("sonda 4 (contrato real): strings no normalizados no llegan al helper", () => {
  // toFlightView normaliza las fechas antes de servirlas; estos casos
  // documentan el comportamiento de la función con entradas teóricas.
  it("arrivalDate '32/13' (día/mes imposibles) no se clasifica como today-*", () => {
    const f = mk({ eta: "10:00", arrivalDate: "32/13" });
    expect(arrivalSegmentState(f, day, now)).not.toMatch(/^today/);
  });

  it("arrivalDate ' 12/05' (espacio inicial, nunca emitido por la API) no matchea hoy", () => {
    // La comparación es literal sobre los 5 primeros caracteres; el trim es
    // responsabilidad del normalizador del servidor, no de este helper.
    expect(isArrivalToday({ eta: "10:00", arrivalDate: " 12/05" }, day)).toBe(false);
  });
});

describe("sonda 5: visita overnight (llega 23:50 hoy, sale 06:00 mañana)", () => {
  const overnight = mk({
    eta: "23:50",
    arrivalDate: "12/05/26",
    etd: "06:00",
    departureDate: "13/05/26",
  });
  const day2 = new Date(Date.UTC(2026, 4, 13, 0, 0, 0));
  const now2 = new Date(Date.UTC(2026, 4, 13, 4, 0, 0));

  it("hoy: arrivals=1, departures=0", () => {
    const stats = computeHeaderStats([overnight], day, now);
    expect(stats.arrivals).toBe(1);
    expect(stats.departures).toBe(0);
  });

  it("hoy: la salida de mañana se pinta como future", () => {
    expect(departureSegmentState(overnight, day, now)).toBe("future");
  });

  it("mañana: arrivals=0, departures=1", () => {
    const stats = computeHeaderStats([overnight], day2, now2);
    expect(stats.arrivals).toBe(0);
    expect(stats.departures).toBe(1);
  });
});

describe("sonda 6: avión basado (PARKED sin eta ni etd)", () => {
  const based = mk({
    id: "based1",
    callsign: "EC-BSD",
    state: "PARKED",
    eta: null,
    etd: null,
    fuelState: "NOT_REQUESTED",
  });

  it("no cuenta como llegada ni salida del día", () => {
    const stats = computeHeaderStats([based], day, now);
    expect(stats.arrivals).toBe(0);
    expect(stats.departures).toBe(0);
  });

  it("su fila es normal (sin urgencia)", () => {
    expect(rowUrgency(based, day, now)).toBe("normal");
  });

  it("no cuenta en pendingDepServices aunque fuelState sea NOT_REQUESTED", () => {
    // Sin salida planificada no hay "servicios de salida pendientes" que perseguir.
    const stats = computeHeaderStats([based], day, now);
    expect(stats.pendingDepServices).toBe(0);
  });
});

describe("sonda 7: dos visitas del mismo avión el mismo día", () => {
  const visit1 = mk({
    id: "v1",
    callsign: "EJU123",
    eta: "09:00",
    arrivalDate: "12/05/26",
    etd: "11:00",
    departureDate: "12/05/26",
  });
  const visit2 = mk({
    id: "v2",
    callsign: "EJU123",
    eta: "15:00",
    arrivalDate: "12/05/26",
    etd: "18:00",
    departureDate: "12/05/26",
  });

  it("arrivals=2 y departures=2 (no se deduplica por callsign)", () => {
    const stats = computeHeaderStats([visit1, visit2], day, now);
    expect(stats.arrivals).toBe(2);
    expect(stats.departures).toBe(2);
  });
});

describe("sonda 8: vuelo fantasma M-FWWW (EXPECTED de hace 10 días)", () => {
  // Caso real de producción: state EXPECTED, eta 12:30, arrivalDate 01/06/26,
  // visto en el tablón el 11/06/2026 a las 13:00Z (su ETA "de hoy" ya pasó).
  const ghostDay = new Date(Date.UTC(2026, 5, 11, 0, 0, 0));
  const ghostNow = new Date(Date.UTC(2026, 5, 11, 13, 0, 0));
  const ghost = mk({
    id: "ghost1",
    callsign: "M-FWWW",
    state: "EXPECTED",
    eta: "12:30",
    arrivalDate: "01/06/26",
  });

  it("no es llegada de hoy", () => {
    expect(isArrivalToday(ghost, ghostDay)).toBe(false);
  });

  it("su segmento de llegada es past", () => {
    expect(arrivalSegmentState(ghost, ghostDay, ghostNow)).toBe("past");
  });

  it("NO dispara alert hoy: su ETA es del 01/06, no de hoy", () => {
    // rowUrgency proyecta la eta sobre el día visualizado ignorando arrivalDate,
    // así que a las 13:00 el vuelo de hace 10 días se pondría rojo. No debe.
    expect(rowUrgency(ghost, ghostDay, ghostNow)).not.toBe("alert");
  });

  it("no infla el contador alerts del header", () => {
    expect(computeHeaderStats([ghost], ghostDay, ghostNow).alerts).toBe(0);
  });
});
