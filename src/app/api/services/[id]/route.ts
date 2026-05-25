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
import { crewItemToService } from "@/lib/crewItemMigration";

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

/**
 * Resolves a Service row for the given id, performing lazy materialization when
 * the id has the sentinel "ci_<crewItemId>" prefix and the Service mirror does
 * not yet exist in the DB.
 *
 * Flow:
 *   1. Try prisma.service.findUnique(id) — happy path (mirror already exists).
 *   2. If null AND id starts with "ci_": look up the source CrewItem.
 *      - If found: upsert the Service mirror (idempotent for races) and return it.
 *      - If not found: return null → caller returns 404.
 *   3. If not a "ci_" id and findUnique returned null: return null → caller returns 404.
 */
async function resolveService(id: string) {
  const existing = await prisma.service.findUnique({ where: { id } });
  if (existing) return existing;

  // Not found — check if this is a sentinel crew-item id
  if (!id.startsWith("ci_")) return null;

  const crewItemId = id.slice("ci_".length);
  const crewItem = await prisma.crewItem.findUnique({ where: { id: crewItemId } });
  if (!crewItem) return null;

  // Lazy-materialize the Service mirror. Use upsert to be race-safe.
  const mapped = crewItemToService(crewItem);
  return prisma.service.upsert({
    where: { id: mapped.id },
    create: {
      id: mapped.id,
      visitId: mapped.visitId,
      type: mapped.type,
      customName: mapped.customName,
      quantity: mapped.quantity,
      state: mapped.state,
      direction: mapped.direction,
      origin: mapped.origin,
      target: mapped.target,
      rawDescription: mapped.rawDescription,
    },
    update: {},  // no-op if it races into existence between findUnique and here
  });
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

  const existing = await resolveService(id);
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
  const service = await resolveService(id);
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
