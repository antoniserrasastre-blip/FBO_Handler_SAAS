// /api/lost-items/[id] — v2

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireWriter } from "@/lib/roles";
import { eventBus } from "@/lib/events";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireWriter();
  if (error) return error;

  const session = await getServerSession(authOptions);
  const { id } = await params;
  const body = await req.json();

  const existing = await prisma.lostItem.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  const changes: string[] = [];

  if (body.state && body.state !== existing.state) {
    data.state = body.state;
    changes.push(`Estado → ${body.state}`);
    const now = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    if (body.state === "CLAIMED") data.claimedAt = now;
    if (body.state === "DELIVERED") data.deliveredAt = now;
  }

  if (body.claimedBy !== undefined) {
    data.claimedBy = body.claimedBy;
    if (body.claimedBy) changes.push(`Reclamado por: ${body.claimedBy}`);
  }

  if (!Object.keys(data).length) {
    return NextResponse.json(existing);
  }

  const updated = await prisma.lostItem.update({ where: { id }, data });

  await prisma.eventLog.create({
    data: {
      visitId: existing.visitId,
      userId: session!.user.id,
      action: `Objeto "${existing.description}": ${changes.join(", ")}`,
    },
  });

  eventBus.emit({
    type: "lost_item_updated",
    flightId: existing.visitId,
    userId: session!.user.id,
    userName: session!.user.name || undefined,
    detail: `Objeto: ${changes.join(", ")}`,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireWriter();
  if (error) return error;

  const session = await getServerSession(authOptions);
  const { id } = await params;

  const existing = await prisma.lostItem.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.lostItem.delete({ where: { id } });

  await prisma.eventLog.create({
    data: {
      visitId: existing.visitId,
      userId: session!.user.id,
      action: `Objeto eliminado: ${existing.description}`,
    },
  });

  eventBus.emit({
    type: "lost_item_updated",
    flightId: existing.visitId,
    userId: session!.user.id,
    userName: session!.user.name || undefined,
    detail: `Objeto eliminado: ${existing.description}`,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
