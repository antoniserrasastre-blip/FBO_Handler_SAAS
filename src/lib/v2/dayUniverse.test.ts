// Sprint 04 board-del-turno — fase ROJA. TEST-WRITER.
// Universo del día compartido (C1/C14): dayUniverseWhere · esArrastre ·
// esVisitaVisible. Contrato pineado: src/lib/mcp/contract.ts §S4.
//
// Mapeo test↔test plan de la spec:
//   T1 (completitud del universo) → dayUniverseWhere: las 3 ramas del OR +
//      ventana de arrastre [D−14, D) sobre la key palmaDay (UTC midnight).
//   T9 (huérfanas)                → esVisitaVisible.
//   T1 (marcado de arrastre)      → esArrastre.
//
// Puros y sin BD: se prueban directamente contra el stub del orquestador (que
// lanza NotImplemented). Esa ES la razón de rojo.

import { describe, it, expect } from "vitest";
import {
  ARRASTRE_WINDOW_DAYS,
  dayUniverseWhere,
  esArrastre,
  esVisitaVisible,
} from "./dayUniverse";

const DAY_MS = 24 * 60 * 60 * 1000;
// Día civil de Palma como KEY (UTC midnight), igual que palmaDayUtc.
const D = new Date(Date.UTC(2026, 6, 23)); // 23-07-2026

describe("ARRASTRE_WINDOW_DAYS — 14 días (gate 23-07)", () => {
  it("es 14 (hecho del scaffold: pin de la constante del gate)", () => {
    // Verde-en-rojo declarado: el orquestador ya fijó la constante; esto la
    // ancla para que un cambio de ventana rompa el contrato explícitamente.
    expect(ARRASTRE_WINDOW_DAYS).toBe(14);
  });
});

describe("dayUniverseWhere — 3 ramas del OR + ventana de arrastre (T1)", () => {
  it("incluye las ramas palmaDay==D y movements.some(scheduledDate==D)", () => {
    const where = dayUniverseWhere(D);
    const s = JSON.stringify(where);
    // Rama 1: día de llegada.
    expect(s).toContain(D.toISOString());
    // Rama 2: alguna pierna planificada para D.
    expect(s).toContain("scheduledDate");
    // La forma es un OR (una sola findMany que dedupa por visitId).
    expect(where).toHaveProperty("OR");
    expect(Array.isArray((where as { OR?: unknown }).OR)).toBe(true);
  });

  it("la rama de ARRASTRE exige DEPARTURE con atd null y flightCategory != CANCELLED", () => {
    const s = JSON.stringify(dayUniverseWhere(D));
    expect(s).toContain("DEPARTURE");
    expect(s).toContain("atd");
    expect(s).toContain("CANCELLED"); // como { not: "CANCELLED" }
  });

  it("la ventana de arrastre es [D−14, D): gte = D−14, lt = D (calendario sobre la key)", () => {
    const s = JSON.stringify(dayUniverseWhere(D));
    const lowerBound = new Date(D.getTime() - ARRASTRE_WINDOW_DAYS * DAY_MS); // 09-07-2026
    // gte (inclusivo) = D − 14 días.
    expect(s).toContain(lowerBound.toISOString());
    // lt (exclusivo) = D (el propio día ya lo cubre la rama 1; la ventana es a días PREVIOS).
    expect(s).toContain(D.toISOString());
    // borde: D−15 NO debe aparecer como límite de la ventana.
    const tooOld = new Date(D.getTime() - (ARRASTRE_WINDOW_DAYS + 1) * DAY_MS);
    expect(s).not.toContain(tooOld.toISOString());
  });
});

describe("esArrastre — la visita viene de un día previo al pedido (T1)", () => {
  it("palmaDay estrictamente ANTERIOR a D → true", () => {
    const visit = { palmaDay: new Date(D.getTime() - 3 * DAY_MS) };
    expect(esArrastre(visit, D)).toBe(true);
  });

  it("palmaDay == D → false (no es arrastre, es del día)", () => {
    expect(esArrastre({ palmaDay: new Date(D.getTime()) }, D)).toBe(false);
  });

  it("palmaDay POSTERIOR a D → false (no puede arrastrarse del futuro)", () => {
    expect(esArrastre({ palmaDay: new Date(D.getTime() + DAY_MS) }, D)).toBe(false);
  });
});

describe("esVisitaVisible — huérfanas de extras invisibles (T9/C14)", () => {
  it("visita SIN movimientos → false (no se lista en ninguna superficie)", () => {
    expect(esVisitaVisible({ movements: [] })).toBe(false);
  });

  it("visita CON al menos un movimiento → true", () => {
    expect(esVisitaVisible({ movements: [{}] })).toBe(true);
  });
});
