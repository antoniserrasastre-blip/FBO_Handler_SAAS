import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireWriter } from "@/lib/roles";
import { eventBus } from "@/lib/events";

// PATCH /api/passengers/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireWriter();
  if (error) return error;

  const session = await getServerSession(authOptions);
  const { id } = await params;
  const body = await req.json();

  const existing = await prisma.passenger.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  const changes: string[] = [];

  for (const field of ["fullName", "gender", "nationality", "passportNumber", "dateOfBirth", "status", "corrections"] as const) {
    if (body[field] !== undefined && body[field] !== (existing as Record<string, unknown>)[field]) {
      data[field] = body[field];
      changes.push(`${field}: ${body[field]}`);
    }
  }
  if (body.verified !== undefined && body.verified !== existing.verified) {
    data.verified = body.verified;
    changes.push(body.verified ? "Verificado" : "No verificado");
  }

  if (!Object.keys(data).length) return NextResponse.json(existing);

  const updated = await prisma.passenger.update({ where: { id }, data });

  await prisma.eventLog.create({
    data: {
      flightId: existing.flightId,
      userId: session!.user.id,
      action: `Pasajero ${existing.fullName}: ${changes.join(", ")}`,
    },
  });

  eventBus.emit({
    type: "passenger_updated",
    flightId: existing.flightId,
    userId: session!.user.id,
    userName: session!.user.name || undefined,
    detail: `Pasajero: ${changes.join(", ")}`,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json(updated);
}

// DELETE /api/passengers/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireWriter();
  if (error) return error;

  const session = await getServerSession(authOptions);
  const { id } = await params;

  const existing = await prisma.passenger.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.passenger.delete({ where: { id } });

  await prisma.eventLog.create({
    data: {
      flightId: existing.flightId,
      userId: session!.user.id,
      action: `Pasajero eliminado: ${existing.fullName}`,
    },
  });

  eventBus.emit({
    type: "passenger_updated",
    flightId: existing.flightId,
    userId: session!.user.id,
    userName: session!.user.name || undefined,
    detail: `Eliminado: ${existing.fullName}`,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
