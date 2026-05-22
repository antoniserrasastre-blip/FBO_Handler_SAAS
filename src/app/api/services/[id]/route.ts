// /api/services/[id] — v2 implementation.
// Service belongs to a Visit (visitId). Auto-transition logic walks
// Visit → DEPARTURE Movement.

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { eventBus } from "@/lib/events";
import { requireWriter } from "@/lib/roles";
import { suggestNextState } from "@/lib/flightUrgency";
import { FLIGHT_STATE_CONFIG, type FlightState } from "@/types";
import { toFlightView } from "@/lib/flightView";

const ALLOWED_SERVICE_PATCH_FIELDS = new Set([
  "type", "customName", "reference",
  "phase", "direction",
  "origin", "target",
  "state", "arrivedAt", "deliveredAt",
  "quantity",
]);

function pickAllowed(body: Record<string, unknown>, allowed: Set<string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(body)) {
    if (allowed.has(key)) out[key] = body[key];
  }
  return out;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireWriter();
  if (error) return error;

  const { id } = await params;
  const rawBody = await req.json();
  const body = pickAllowed(rawBody, ALLOWED_SERVICE_PATCH_FIELDS);

  // Legacy `phase` → `direction`
  if (body.phase !== undefined && body.direction === undefined) {
    body.direction = body.phase;
    delete body.phase;
  }

  const existing = await prisma.service.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const now = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

  const data: Record<string, unknown> = { ...body };
  if (body.state === "ARRIVED" && !existing.arrivedAt) data.arrivedAt = now;
  if (body.state === "DELIVERED" && !existing.deliveredAt) {
    data.deliveredAt = now;
    if (!existing.arrivedAt) data.arrivedAt = now;
  }
  if (body.state === "PENDING") {
    data.arrivedAt = null;
    data.deliveredAt = null;
  }
  if (body.state === "CANCELLED") {
    data.arrivedAt = null;
    data.deliveredAt = null;
  }

  const service = await prisma.service.update({
    where: { id },
    data: data as Prisma.ServiceUpdateInput,
  });

  const newState = typeof body.state === "string" ? body.state : null;
  if (newState && newState !== existing.state) {
    const stateLabel: Record<string, string> = { PENDING: "pendiente", ARRIVED: "llegado", DELIVERED: "entregado", CANCELLED: "cancelado" };
    const actionDesc = `Servicio ${existing.type}: ${stateLabel[newState] || newState}`;
    await prisma.eventLog.create({
      data: { visitId: existing.visitId, userId: session.user.id, action: actionDesc },
    });

    eventBus.emit({
      type: "service_updated",
      flightId: existing.visitId,
      userId: session.user.id,
      userName: session.user.name || undefined,
      detail: actionDesc,
      timestamp: new Date().toISOString(),
    });

    // Auto-transition: service change can close arrival phase
    const visit = await prisma.visit.findUnique({
      where: { id: existing.visitId },
      include: { aircraft: true, movements: true, services: true },
    });
    if (visit) {
      const view = toFlightView(visit);
      const next: FlightState | null = suggestNextState(view, visit.services);
      if (next && next !== view.state) {
        const dep = visit.movements.find((m) => m.direction === "DEPARTURE")
                 || visit.movements.find((m) => m.direction === "ARRIVAL");
        if (dep) {
          await prisma.movement.update({ where: { id: dep.id }, data: { state: next } });
          await prisma.eventLog.create({
            data: {
              visitId: visit.id,
              movementId: dep.id,
              userId: session.user.id,
              action: `Auto-transición → ${FLIGHT_STATE_CONFIG[next].label}`,
            },
          });
          eventBus.emit({
            type: "flight_updated",
            flightId: visit.id,
            userId: session.user.id,
            userName: session.user.name || undefined,
            detail: `Estado → ${FLIGHT_STATE_CONFIG[next].label}`,
            timestamp: new Date().toISOString(),
          });
        }
      }
    }
  }

  return NextResponse.json({ ...service, phase: service.direction });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireWriter();
  if (error) return error;

  const { id } = await params;
  const service = await prisma.service.findUnique({ where: { id } });
  if (!service) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.service.delete({ where: { id } });

  await prisma.eventLog.create({
    data: {
      visitId: service.visitId,
      userId: session.user.id,
      action: `Servicio eliminado: ${service.type}`,
    },
  });

  eventBus.emit({
    type: "service_deleted",
    flightId: service.visitId,
    userId: session.user.id,
    userName: session.user.name || undefined,
    detail: `Servicio eliminado: ${service.type}`,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
