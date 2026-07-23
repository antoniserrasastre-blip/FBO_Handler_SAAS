// §S4 C1/C14 — universo del día compartido: get_day · find_flight ·
// /api/flights GET consumen ESTE where y ESTE filtro de visibilidad (una
// sola fuente, jamás tres copias). Contrato: src/lib/mcp/contract.ts §S4.

import type { Prisma } from "@prisma/client";

/** Ventana de arrastre en días de calendario (gate de Toni 23-07-2026). */
export const ARRASTRE_WINDOW_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Where de Visit para el día civil D (palmaDay, UTC midnight):
 *   palmaDay == D
 *   ∪ movements.some(scheduledDate == D)
 *   ∪ ARRASTRE: palmaDay ∈ [D−14, D) con DEPARTURE atd==null no CANCELLED.
 * Dedupe implícito: una sola findMany con OR devuelve cada visitId una vez.
 * La ventana es aritmética de CALENDARIO sobre la key palmaDay (UTC midnight),
 * jamás offsets de zona horaria a mano.
 */
export function dayUniverseWhere(palmaDay: Date): Prisma.VisitWhereInput {
  const gte = new Date(palmaDay.getTime() - ARRASTRE_WINDOW_DAYS * DAY_MS);
  return {
    OR: [
      { palmaDay },
      { movements: { some: { scheduledDate: palmaDay } } },
      {
        palmaDay: { gte, lt: palmaDay },
        movements: {
          some: {
            direction: "DEPARTURE",
            atd: null,
            flightCategory: { not: "CANCELLED" },
          },
        },
      },
    ],
  };
}

/** C14: una visit sin movimientos (huérfana de extras) no se lista jamás. */
export function esVisitaVisible(visit: { movements: unknown[] }): boolean {
  return visit.movements.length > 0;
}

/** C1: ¿la visit viene arrastrada de un día previo al pedido? */
export function esArrastre(
  visit: { palmaDay: Date },
  palmaDay: Date
): boolean {
  return visit.palmaDay.getTime() < palmaDay.getTime();
}
