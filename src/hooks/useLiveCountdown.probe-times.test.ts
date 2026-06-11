// Sondas de tiempo: calcMinutes (parser HH:MM) y su efecto aguas arriba en
// arrivalSegmentState / rowUrgency (/dia).
//
// Reconciliado tras la QA run del 11-06-2026: las sondas que destapaban el
// fallo silencioso de "HHMM" sin dos puntos quedan en verde con el fix
// (calcMinutes acepta "0900" y pdfParserV2 normaliza al importar); las sondas
// de diseño (medianoche con dayUtc, rama sin dayUtc) afirman el contrato
// actual documentado.

import { describe, it, expect } from "vitest";
import { calcMinutes } from "./useLiveCountdown";
import {
  arrivalSegmentState,
  rowUrgency,
  type FlightLite,
} from "@/app/dia/diaHelpers";

// --- factory y constantes copiadas de src/app/dia/diaHelpers.test.ts ---
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

// nows adicionales para las sondas
const now1400 = new Date(Date.UTC(2026, 4, 12, 14, 0, 0)); // 14:00 Z
const now2330 = new Date(Date.UTC(2026, 4, 12, 23, 30, 0)); // 23:30 Z
const now2350 = new Date(Date.UTC(2026, 4, 12, 23, 50, 0)); // 23:50 Z
const midnight = new Date(Date.UTC(2026, 4, 12, 0, 0, 0)); // 00:00 Z
const noon = new Date(Date.UTC(2026, 4, 12, 12, 0, 0)); // 12:00 Z

describe("calcMinutes — formatos de hora reales (sonda 1)", () => {
  // Contrato tras el fix: se acepta "H:MM", "HH:MM" y el compacto de 4
  // dígitos "HHMM". Lo que no es una hora sigue devolviendo null.
  it("'0900' (HHMM sin dos puntos) se acepta como 09:00", () => {
    expect(calcMinutes("0900", day, now)).toBe(-60);
    expect(calcMinutes("0900", day, now)).toBe(calcMinutes("09:00", day, now));
  });

  it("'TBN' devuelve null (correcto: no hay hora que contar)", () => {
    expect(calcMinutes("TBN", day, now)).toBeNull();
  });

  it("'10:5' (minutos de 1 dígito) devuelve null (ambiguo: ¿10:05 o 10:50?)", () => {
    expect(calcMinutes("10:5", day, now)).toBeNull();
  });

  it("'--:--' devuelve null (correcto: placeholder sin hora)", () => {
    expect(calcMinutes("--:--", day, now)).toBeNull();
  });

  it("'' (cadena vacía) devuelve null (correcto)", () => {
    expect(calcMinutes("", day, now)).toBeNull();
  });

  it("4 dígitos fuera de rango ('9900', '1290') devuelven null — no toda cifra es una hora", () => {
    expect(calcMinutes("9900", day, now)).toBeNull();
    expect(calcMinutes("1290", day, now)).toBeNull();
  });
});

describe("calcMinutes — '9:00' debe funcionar igual que '09:00' (sonda 4)", () => {
  it("hora de 1 dígito se acepta y da el mismo resultado que con cero inicial", () => {
    const oneDigit = calcMinutes("9:00", day, now);
    const twoDigit = calcMinutes("09:00", day, now);
    expect(oneDigit).toBe(-60);
    expect(oneDigit).toBe(twoDigit);
  });
});

describe("calcMinutes — '24:00' rueda al día siguiente (sonda 3)", () => {
  it("CONTRATO: '24:00' del día D es la medianoche de fin de día (00:00 de D+1)", () => {
    // Decisión documentada (QA run 11-06-2026): '24:00' se acepta como
    // medianoche de fin de día — Date.UTC desborda de forma determinista a
    // las 00:00 del día D+1. now = 23:30 Z del día D → quedan +30 min.
    // '24:01' o superiores sí se rechazan (null): solo 24:00 es válido.
    expect(calcMinutes("24:00", day, now2330)).toBe(30);
    expect(calcMinutes("24:01", day, now2330)).toBeNull();
  });
});

describe("EL BUG GORDO (cerrado) — ETA 'HHMM' ya no deja un retraso de 5h invisible (sonda 2)", () => {
  // Vuelo EXPECTED con eta "0900". Antes del fix: calcMinutes devolvía null
  // y el vuelo quedaba 'today-pending' sin colorear con 5 h de retraso.
  // Tras el fix (calcMinutes acepta HHMM; además pdfParserV2 normaliza a
  // "HH:MM" al importar, así que este formato ya no debería llegar a BD),
  // el operador lo ve en rojo.
  const lateFlight = mk({
    state: "EXPECTED",
    eta: "0900",
    arrivalDate: "12/05/26",
  });

  it("a las 14:00, eta '0900' → arrivalSegmentState es 'today-overdue'", () => {
    expect(arrivalSegmentState(lateFlight, day, now1400)).toBe("today-overdue");
  });

  it("a las 14:00, eta '0900' → rowUrgency es 'alert'", () => {
    expect(rowUrgency(lateFlight, day, now1400)).toBe("alert");
  });

  it("control: el mismo vuelo con eta '09:00' marca overdue + alert", () => {
    const ok = mk({ state: "EXPECTED", eta: "09:00", arrivalDate: "12/05/26" });
    expect(arrivalSegmentState(ok, day, now1400)).toBe("today-overdue");
    expect(rowUrgency(ok, day, now1400)).toBe("alert");
  });
});

describe("calcMinutes — medianoche con dayUtc (sonda 5, contrato)", () => {
  it("CONTRATO: con dayUtc la hora se ancla a la fecha almacenada, sin heurística", () => {
    // ETA '00:10' del día D visto a las 23:50 del día D → -1420 (vencido
    // 23h40). Es el contrato 'fiel al dato': si la hoja dice día D, las
    // 00:10 del día D fueron hace 23h40. El caso de madrugada (vuelo que
    // aterriza a las 00:10 'de esta noche' pero viene en la hoja con fecha
    // D) es un problema del DATO importado, no de esta función — corregirlo
    // aquí con heurística reintroduciría el bug de +1000 min que motivó
    // dayUtc (ver useLiveCountdown.test.ts).
    expect(calcMinutes("00:10", day, now2350)).toBe(-1420);
  });
});

describe("calcMinutes — rama sin dayUtc hace wrap ±12h (sonda 6, contrato)", () => {
  // CONTRATO de las dos ramas (documentado en la QA run 11-06-2026):
  // - Con dayUtc: aritmética absoluta anclada a la fecha (autoritativa).
  //   Es la rama que usan /dia y, tras el fix A3, también VisitCard /
  //   TurnaroundCountdown en la vista Helix.
  // - Sin dayUtc: fallback legacy que interpreta la hora como la ocurrencia
  //   más cercana (wrap ±12h), para llamadores sin fecha disponible.
  // Que diverjan cerca de medianoche es inherente al diseño del fallback;
  // la convergencia de vistas se logra pasando dayUtc, no igualando ramas.
  it("ETA '00:10' a las 23:50 sin dayUtc → +20 (ocurrencia más cercana)", () => {
    expect(calcMinutes("00:10", null, now2350)).toBe(20);
  });

  it("CONTRATO: las dos ramas responden a preguntas distintas y pueden divergir", () => {
    const withDay = calcMinutes("00:10", day, now2350); // fiel a la fecha
    const withoutDay = calcMinutes("00:10", null, now2350); // ocurrencia más cercana
    expect(withDay).toBe(-1420);
    expect(withoutDay).toBe(20);
  });
});

describe("calcMinutes — fronteras del wrap ±12h (sonda 7)", () => {
  it("exactamente +12h por delante se conserva como +720 (no hace wrap)", () => {
    // now 00:00, target 12:00 → diff = 720; la condición es estricta (> 720).
    expect(calcMinutes("12:00", null, midnight)).toBe(720);
  });

  it("exactamente -12h por detrás se conserva como -720 (no hace wrap)", () => {
    // now 12:00, target 00:00 → diff = -720; condición estricta (< -720).
    expect(calcMinutes("00:00", null, noon)).toBe(-720);
  });

  it("+12h01 por delante se convierte en -11h59 (límite del diseño sin fecha)", () => {
    // now 00:00, target 12:01 → diff = 721 > 720 → 721 - 1440 = -719.
    // Límite asumido del fallback sin fecha: a más de 12h vista no hay
    // respuesta correcta sin conocer el día — por eso dayUtc es la rama
    // autoritativa.
    expect(calcMinutes("12:01", null, midnight)).toBe(-719);
  });
});
