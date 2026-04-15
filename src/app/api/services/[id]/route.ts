import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { eventBus } from "@/lib/events";

// PATCH /api/services/[id] — update a service (toggle delivered, etc.)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

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
    data,
  });

  if (body.state && body.state !== existing.state) {
    const stateLabel: Record<string, string> = { PENDING: "pendiente", ARRIVED: "llegado", DELIVERED: "entregado" };
    const actionDesc = `Servicio ${existing.type}: ${stateLabel[body.state] || body.state}`;
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
  }

  return NextResponse.json(service);
}

// DELETE /api/services/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
