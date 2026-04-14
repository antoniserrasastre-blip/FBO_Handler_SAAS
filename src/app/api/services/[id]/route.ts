import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

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
    await prisma.eventLog.create({
      data: {
        flightId: existing.flightId,
        userId: session.user.id,
        action: `Servicio ${existing.type}: ${body.state === "DELIVERED" ? "entregado" : "pendiente"}`,
      },
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

  return NextResponse.json({ ok: true });
}
