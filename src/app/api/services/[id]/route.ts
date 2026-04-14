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
  if (body.state === "DELIVERED" && !existing.deliveredAt) {
    data.deliveredAt = now;
  }
  if (body.state === "PENDING") {
    data.deliveredAt = null;
  }

  const service = await prisma.service.update({
    where: { id },
    data,
  });

  if (body.state && body.state !== existing.state) {
    const actionDesc = `Servicio ${existing.type}: ${body.state === "DELIVERED" ? "entregado" : "pendiente"}`;
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
