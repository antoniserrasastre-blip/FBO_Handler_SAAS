// B1 — sweep de no-shows.
//
// Marca como NO_SHOW (estado terminal, ver NO_SHOW_STATE en src/types) los
// ARRIVAL que siguen EXPECTED sin ninguna evidencia de llegada (ata o
// livePhase LANDED/ON_BLOCKS) y cuyo scheduledDate es anterior a hoy-1.
// Los EXPECTED de ayer se respetan: pueden ser vuelos retrasados de madrugada.
//
// Corre al cierre del import diario (PUT /api/import). La primera ejecución
// tras el despliegue limpia por sí sola los ~484 históricos acumulados desde
// el 18-05 — no hace falta (ni debe hacerse) ninguna limpieza manual en BD.

import { prisma } from "@/lib/db";
import { eventBus } from "@/lib/events";
import { getSpainToday } from "@/lib/time";
import { NO_SHOW_STATE } from "@/types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** livePhases que cuentan como evidencia de que el avión llegó de verdad. */
function hasArrivalEvidence(m: { ata: string | null; livePhase: string | null }): boolean {
  return Boolean(m.ata) || m.livePhase === "LANDED" || m.livePhase === "ON_BLOCKS";
}

/**
 * Devuelve el número de movements marcados NO_SHOW.
 * `today` es inyectable para tests (por defecto, el día operativo de Palma).
 */
export async function sweepNoShows(
  args: { userId?: string | null; today?: Date } = {}
): Promise<number> {
  const today = args.today ?? getSpainToday();
  const cutoff = new Date(today.getTime() - DAY_MS); // día-1: aún válido

  const stale = await prisma.movement.findMany({
    where: {
      direction: "ARRIVAL",
      state: "EXPECTED",
      ata: null,
      scheduledDate: { lt: cutoff },
    },
    select: {
      id: true,
      visitId: true,
      callsign: true,
      ata: true,
      livePhase: true,
      flightCategory: true,
      scheduledDate: true,
    },
  });

  let marked = 0;
  for (const m of stale) {
    // Evidencia y cancelados se filtran en JS: `notIn` de Prisma no matchea
    // filas con livePhase NULL (semántica SQL de NOT IN), que son la mayoría.
    if (m.flightCategory === "CANCELLED") continue;
    if (hasArrivalEvidence(m)) continue;

    await prisma.movement.update({
      where: { id: m.id },
      data: { state: NO_SHOW_STATE },
    });
    // Código de estado en action (formato parseado por /dia), label en detail.
    await prisma.eventLog.create({
      data: {
        visitId: m.visitId,
        movementId: m.id,
        userId: args.userId ?? null,
        action: `Auto-transición → ${NO_SHOW_STATE}`,
        details: `Llegada nunca registrada (programada ${m.scheduledDate.toISOString().slice(0, 10)})`,
      },
    });
    eventBus.emit({
      type: "flight_updated",
      flightId: m.visitId,
      userId: args.userId ?? undefined,
      detail: `${m.callsign}: Estado → No-show`,
      timestamp: new Date().toISOString(),
    });
    marked++;
  }

  return marked;
}
