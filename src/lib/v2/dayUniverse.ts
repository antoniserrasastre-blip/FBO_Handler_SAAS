// §S4 C1/C14 — universo del día compartido: get_day · find_flight ·
// /api/flights GET consumen ESTE where y ESTE filtro de visibilidad (una
// sola fuente, jamás tres copias). Contrato: src/lib/mcp/contract.ts §S4.

import type { Prisma } from "@prisma/client";
// Estado terminal de no-presentacion (no parte de la progresion operativa).
import { NO_SHOW_STATE } from "@/types";

/** Ventana de arrastre en días de calendario (gate de Toni 23-07-2026). */
export const ARRASTRE_WINDOW_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Estados TERMINALES de una salida: ya no esta pendiente (OFF_BLOCKS = ya
 * salio; NO_SHOW = nunca llego). Solo se usan para PODAR la rama de ARRASTRE
 * (smoke prod: 103 NO_SHOW + 12 OFF_BLOCKS fantasmas de 184). NO afecta a las
 * ramas del propio dia (palmaDay==D / scheduledDate==D), donde un terminal SI
 * debe verse en SU dia.
 */
const ARRASTRE_TERMINAL_STATES = ["OFF_BLOCKS", NO_SHOW_STATE] as const;

/**
 * Where de Visit para el día civil D (palmaDay, UTC midnight):
 *   palmaDay == D
 *   ∪ movements.some(scheduledDate == D)
 *   ∪ ARRASTRE: palmaDay ∈ [D−14, D) con DEPARTURE atd==null, no CANCELLED y
 *     en estado NO terminal (sigue pendiente de salir).
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
            // La salida debe seguir PENDIENTE: excluye terminales (ya salio /
            // nunca llego) — solo en el arrastre, jamas en el propio dia.
            state: { notIn: [...ARRASTRE_TERMINAL_STATES] },
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
