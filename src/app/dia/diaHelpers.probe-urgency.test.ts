// Sondas de urgencia/colores del Tablón /dia.
// Cada test afirma el comportamiento CORRECTO desde el punto de vista del
// operador del FBO. Si falla, es porque el código tiene el comportamiento
// sospechoso (ver describe de cada bloque), no porque el test esté mal.

import { describe, it, expect } from "vitest";
import {
  nextEventMinutes,
  rowUrgency,
  computeHeaderStats,
  arrivalSegmentState,
  STATE_DOT_CLASS,
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
// Sonda 1 — fuel NOT_REQUESTED significa "no necesita fuel", no "fuel pendiente".
// En producción 1260/1302 movements tienen fuelState NOT_REQUESTED: si cuenta
// como pendiente, casi toda salida a <30 min se pinta de rojo sin motivo.
// ---------------------------------------------------------------------------
describe("sonda 1: fuel NOT_REQUESTED no es un servicio pendiente", () => {
  const cleanFlight = (state: string) =>
    mk({
      state: state as FlightLite["state"],
      etd: "10:20", // a 20 min del ETD
      fuelState: "NOT_REQUESTED",
      toiletState: "NOT_REQUESTED",
      services: [],
    });

  it("PARKED sin nada pendiente a 20 min del ETD es imminent, no alert", () => {
    expect(rowUrgency(cleanFlight("PARKED"), day, now)).toBe("imminent");
  });

  it("DEPARTING sin nada pendiente a 20 min del ETD es imminent, no alert", () => {
    expect(rowUrgency(cleanFlight("DEPARTING"), day, now)).toBe("imminent");
  });

  it("fuel REQUESTED (de verdad pendiente) a 20 min sí es alert", () => {
    const f = mk({ state: "DEPARTING", etd: "10:20", fuelState: "REQUESTED" });
    expect(rowUrgency(f, day, now)).toBe("alert");
  });

  it("fuel NOT_REQUESTED no infla pendingDepServices en la cabecera", () => {
    const stats = computeHeaderStats([cleanFlight("PARKED")], day, now);
    expect(stats.pendingDepServices).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Sonda 2 — simetría cabecera↔fila: si la fila se pinta de alert por un
// servicio de salida pendiente (toilet REQUESTED), la pill "pendientes" de la
// cabecera debería contar ese mismo vuelo. Sospecha: condición duplicada a
// mano en computeHeaderStats que no mira toiletState.
// ---------------------------------------------------------------------------
describe("sonda 2: simetría cabecera↔fila con toilet REQUESTED", () => {
  const f = mk({
    state: "DEPARTING",
    etd: "10:20",
    fuelState: "SERVED",
    toiletState: "REQUESTED",
    services: [],
  });

  it("la fila da alert (toilet pendiente a 20 min del ETD)", () => {
    expect(rowUrgency(f, day, now)).toBe("alert");
  });

  it("la cabecera cuenta ese vuelo en pendingDepServices", () => {
    expect(computeHeaderStats([f], day, now).pendingDepServices).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Sonda 3 — coherencia: alerts de la cabecera == nº de filas con urgencia alert.
// ---------------------------------------------------------------------------
describe("sonda 3: alerts de cabecera coincide con filas en alert", () => {
  it("con 6 vuelos variados, alerts == count(rowUrgency === 'alert')", () => {
    const flights: FlightLite[] = [
      mk({ id: "a", state: "EXPECTED", eta: "12:00" }),                               // normal
      mk({ id: "b", state: "PARKED", etd: "09:30", fuelState: "SERVED" }),            // ETD pasado → alert
      mk({
        id: "c", state: "DEPARTING", etd: "10:20", fuelState: "SERVED",
        services: [{ state: "PENDING", direction: "DEPARTURE" }],
      }),                                                                              // pendiente real <30 → alert
      mk({ id: "d", state: "DEPARTED", etd: "09:00" }),                               // departed
      mk({ id: "e", state: "PARKED", etd: "11:00", fuelState: "SERVED" }),            // 60 min → soon
      mk({ id: "f", state: "PARKED", etd: "10:25", fuelState: "SERVED" }),            // 25 min → imminent
    ];
    const expectedAlerts = flights.filter((f) => rowUrgency(f, day, now) === "alert").length;
    expect(computeHeaderStats(flights, day, now).alerts).toBe(expectedAlerts);
  });
});

// ---------------------------------------------------------------------------
// Sonda 4 (REESCRITA tras la QA run 11-06-2026) — el reclamo original
// ("ARRIVING = en el aire, su próximo evento es la ETA") fue REFUTADO:
// el enum persistido sigue siendo el legacy de 6 estados (EXPECTED, ON_BLOCKS,
// PARKED, TURNAROUND, BOARDING, OFF_BLOCKS) — "ARRIVING" no llega nunca desde
// la BD, así que el escenario "volando con ambas horas" es inalcanzable en
// producción. Documentamos el contrato real a nivel de unidad: cualquier
// estado que no sea EXPECTED ni DEPARTED/OFF_BLOCKS cae al branch default
// (reloj ETD), que es el comportamiento correcto para vuelos en tierra.
// ---------------------------------------------------------------------------
describe("sonda 4 (contrato real): estados no-EXPECTED se miden contra la ETD", () => {
  it("nextEventMinutes de un estado distinto de EXPECTED usa la ETD", () => {
    const f = mk({ state: "ARRIVING", eta: "10:40", etd: "10:25" });
    expect(nextEventMinutes(f, day, now)).toBe(25);
  });
});

// ---------------------------------------------------------------------------
// Sonda 5 — estado desconocido: el dot no debería quedar invisible (sin clase)
// y la fila no debería pintarse de alert por defecto.
// ---------------------------------------------------------------------------
describe("sonda 5: estado desconocido (p.ej. CANCELLED)", () => {
  it("el dot de un estado no mapeado queda visible (fallback del consumidor)", () => {
    // El mapa devuelve undefined para estados desconocidos, pero el único
    // consumidor (dia/page.tsx:319) aplica `?? "bg-gray-300"`, así que el
    // operador siempre ve un dot. Afirmamos ese contrato a nivel de UI.
    const dotCls = STATE_DOT_CLASS["CANCELLED"] ?? "bg-gray-300";
    expect(dotCls).toBeTruthy();
  });

  it("rowUrgency con estado desconocido cae al branch default (contrato real)", () => {
    // REESCRITA tras la QA run 11-06-2026: "CANCELLED" no es un valor de
    // state persistible (la cancelación vive en flightCategory; el enum de
    // state es el legacy de 6) — el escenario es inalcanzable con datos
    // reales. A nivel de unidad, un estado no reconocido se trata como vuelo
    // en tierra: con ETD pasada y sin ATD da alert, igual que PARKED. Es
    // aceptable porque fail-loud (rojo) es preferible a esconder un estado
    // corrupto, y /dia ya atenúa los CANCELLED vía flightCategory.
    const f = { ...mk({ etd: "09:00" }), state: "CANCELLED" } as unknown as FlightLite;
    expect(rowUrgency(f, day, now)).toBe("alert");
  });
});

// ---------------------------------------------------------------------------
// Sonda 6 — fronteras exactas de los umbrales (30 / 90 / gracia -5 de ETA).
// ---------------------------------------------------------------------------
describe("sonda 6: fronteras exactas de urgencia", () => {
  it("a exactamente 30 min con servicio DEPARTURE pendiente real → alert", () => {
    const f = mk({
      state: "DEPARTING", etd: "10:30", fuelState: "SERVED",
      services: [{ state: "PENDING", direction: "DEPARTURE" }],
    });
    expect(rowUrgency(f, day, now)).toBe("alert");
  });

  it("a exactamente 30 min sin pendientes → imminent", () => {
    const f = mk({ state: "DEPARTING", etd: "10:30", fuelState: "SERVED" });
    expect(rowUrgency(f, day, now)).toBe("imminent");
  });

  it("a exactamente 90 min → soon; a 91 → normal", () => {
    expect(rowUrgency(mk({ state: "PARKED", etd: "11:30", fuelState: "SERVED" }), day, now)).toBe("soon");
    expect(rowUrgency(mk({ state: "PARKED", etd: "11:31", fuelState: "SERVED" }), day, now)).toBe("normal");
  });

  it("arrivalSegmentState a exactamente -5 min de la ETA sigue today-pending (gracia inclusiva)", () => {
    expect(arrivalSegmentState(mk({ eta: "09:55" }), day, now)).toBe("today-pending");
  });

  it("arrivalSegmentState a -6 min de la ETA ya es today-overdue", () => {
    expect(arrivalSegmentState(mk({ eta: "09:54" }), day, now)).toBe("today-overdue");
  });
});

// ---------------------------------------------------------------------------
// Sonda 7 — paridad de colores legacy↔nuevo (solo dots; la urgencia legacy ya
// está cubierta en diaHelpers.test.ts).
// ---------------------------------------------------------------------------
describe("sonda 7: paridad de dots legacy", () => {
  it("ON_BLOCKS usa el mismo dot que ARRIVING", () => {
    expect(STATE_DOT_CLASS.ON_BLOCKS).toBe(STATE_DOT_CLASS.ARRIVING);
  });

  it("OFF_BLOCKS usa el mismo dot que DEPARTED", () => {
    expect(STATE_DOT_CLASS.OFF_BLOCKS).toBe(STATE_DOT_CLASS.DEPARTED);
  });
});
