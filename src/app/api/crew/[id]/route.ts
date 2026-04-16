import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireWriter } from "@/lib/roles";
import { eventBus } from "@/lib/events";

// PATCH /api/crew/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireWriter();
  if (error) return error;

  const session = await getServerSession(authOptions);
  const { id } = await params;
  const body = await req.json();

  const existing = await prisma.crewMember.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  const changes: string[] = [];

  for (const field of ["fullName", "nationality", "passportNumber", "dateOfBirth", "role"] as const) {
    if (body[field] !== undefined && body[field] !== (existing as Record<string, unknown>)[field]) {
      data[field] = body[field];
      changes.push(`${field}: ${body[field]}`);
    }
  }

  if (!Object.keys(data).length) return NextResponse.json(existing);

  const updated = await prisma.crewMember.update({ where: { id }, data });

  await prisma.eventLog.create({
    data: {
      flightId: existing.flightId,
      userId: session!.user.id,
      action: `Tripulante ${existing.fullName}: ${changes.join(", ")}`,
    },
  });

  eventBus.emit({
    type: "crew_updated",
    flightId: existing.flightId,
    userId: session!.user.id,
    userName: session!.user.name || undefined,
    detail: `Tripulante: ${changes.join(", ")}`,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json(updated);
}

// DELETE /api/crew/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireWriter();
  if (error) return error;

  const session = await getServerSession(authOptions);
  const { id } = await params;

  const existing = await prisma.crewMember.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.crewMember.delete({ where: { id } });

  await prisma.eventLog.create({
    data: {
      flightId: existing.flightId,
      userId: session!.user.id,
      action: `Tripulante eliminado: ${existing.fullName}`,
    },
  });

  eventBus.emit({
    type: "crew_updated",
    flightId: existing.flightId,
    userId: session!.user.id,
    userName: session!.user.name || undefined,
    detail: `Eliminado: ${existing.fullName}`,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
