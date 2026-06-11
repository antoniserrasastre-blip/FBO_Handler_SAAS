// Auto-transición de estado compartida (deuda D2 de estado.md).
//
// /api/flights/[id] y /api/services/[id] duplicaban esta lógica con
// comportamientos divergentes: services creaba un EventLog con movementId y
// emitía un flight_updated propio; flights no. Unificado aquí al
// comportamiento más completo (log con movementId + emit SSE).
//
// EventLog.action lleva el CÓDIGO de estado ("Auto-transición → ON_BLOCKS"),
// no el label de UI: deriveATA/deriveATD (src/app/dia/diaHelpers.ts) parsean
// estos logs por código para reconstruir ATA/ATD. El label español se reserva
// para el `detail` del evento SSE (texto visible de UI).

import { prisma } from "@/lib/db";
import { eventBus } from "@/lib/events";
import { suggestNextState } from "@/lib/flightUrgency";
import { FLIGHT_STATE_CONFIG, type FlightState } from "@/types";
import { toFlightView } from "@/lib/flightView";

/**
 * Recalcula el estado sugerido del visit y, si avanza, lo persiste en el
 * Movement primario (DEPARTURE si existe, si no ARRIVAL), deja EventLog y
 * emite `flight_updated`.
 *
 * Devuelve el nuevo estado aplicado, o null si no hubo transición.
 */
export async function applyAutoTransition(args: {
  visitId: string;
  userId: string;
  userName?: string | null;
}): Promise<FlightState | null> {
  const visit = await prisma.visit.findUnique({
    where: { id: args.visitId },
    include: { aircraft: true, movements: true, services: true },
  });
  if (!visit) return null;

  const view = toFlightView(visit);
  const next: FlightState | null = suggestNextState(view, visit.services);
  if (!next || next === view.state) return null;

  const target =
    visit.movements.find((m) => m.direction === "DEPARTURE") ||
    visit.movements.find((m) => m.direction === "ARRIVAL");
  if (!target) return null;

  await prisma.movement.update({ where: { id: target.id }, data: { state: next } });

  await prisma.eventLog.create({
    data: {
      visitId: visit.id,
      movementId: target.id,
      userId: args.userId,
      action: `Auto-transición → ${next}`,
    },
  });

  eventBus.emit({
    type: "flight_updated",
    flightId: visit.id,
    userId: args.userId,
    userName: args.userName || undefined,
    detail: `Estado → ${FLIGHT_STATE_CONFIG[next].label}`,
    timestamp: new Date().toISOString(),
  });

  return next;
}
