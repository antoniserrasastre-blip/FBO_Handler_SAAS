import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { eventBus } from "@/lib/events";
import { requireWriter } from "@/lib/roles";
import { suggestNextState } from "@/lib/flightUrgency";
import { FLIGHT_STATE_CONFIG, type FlightState } from "@/types";

const ALLOWED_SERVICE_PATCH_FIELDS = new Set([
  "type", "customName", "reference",
  "phase", "scheduledAt",
  "origin", "target",
  "state", "arrivedAt", "deliveredAt",
]);

function pickAllowed(body: Record<string, unknown>, allowed: Set<string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(body)) {
    if (allowed.has(key)) out[key] = body[key];
  }
  return out;
}

// PATCH /api/services/[id] — update a service (toggle delivered, etc.)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireWriter();
  if (error) return error;

  const { id } = await params;
  const rawBody = await req.json();
  const body = pickAllowed(rawBody, ALLOWED_SERVICE_PATCH_FIELDS);

  const existing = await prisma.service.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const now = new Date().toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const data: Record<string, unknown> = { ...body };
  // Auto-set timestamps based on state transitions
  if (body.state === "ARRIVED" && !existing.arrivedAt) {
    data.arrivedAt = now;
  }
  if (body.state === "DELIVERED" && !existing.deliveredAt) {
    data.deliveredAt = now;
    if (!existing.arrivedAt) data.arrivedAt = now; // Skip arrived if going straight to delivered
  }
  if (body.state === "PENDING") {
    data.arrivedAt = null;
    data.deliveredAt = null;
  }

  const service = await prisma.service.update({
    where: { id },
    data: data as Prisma.ServiceUpdateInput,
  });

  const newState = typeof body.state === "string" ? body.state : null;
  if (newState && newState !== existing.state) {
    const stateLabel: Record<string, string> = { PENDING: "pendiente", ARRIVED: "llegado", DELIVERED: "entregado" };
    const actionDesc = `Servicio ${existing.type}: ${stateLabel[newState] || newState}`;
    await prisma.eventLog.create({
      data: {
        flightId: existing.flightId,
        userId: session.user.id,
        action: actionDesc,
      },
    });

    eventBus.emit({
      type: "service_updated",
      flightId: existing.flightId,
      userId: session.user.id,
      userName: session.user.name || undefined,
      detail: actionDesc,
      timestamp: new Date().toISOString(),
    });

    // Auto-transición del vuelo: al cambiar un servicio podemos cerrar la fase de llegada
    const flight = await prisma.flight.findUnique({
      where: { id: existing.flightId },
      include: { services: true },
    });
    if (flight) {
      const next: FlightState | null = suggestNextState(flight, flight.services);
      if (next && next !== flight.state) {
        await prisma.flight.update({ where: { id: flight.id }, data: { state: next } });
        await prisma.eventLog.create({
          data: {
            flightId: flight.id,
            userId: session.user.id,
            action: `Auto-transición → ${FLIGHT_STATE_CONFIG[next].label}`,
          },
        });
        eventBus.emit({
          type: "flight_updated",
          flightId: flight.id,
          userId: session.user.id,
          userName: session.user.name || undefined,
          detail: `Estado → ${FLIGHT_STATE_CONFIG[next].label}`,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  return NextResponse.json(service);
}

// DELETE /api/services/[id]
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
      flightId: service.flightId,
      userId: session.user.id,
      action: `Servicio eliminado: ${service.type}`,
    },
  });

  eventBus.emit({
    type: "service_deleted",
    flightId: service.flightId,
    userId: session.user.id,
    userName: session.user.name || undefined,
    detail: `Servicio eliminado: ${service.type}`,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
