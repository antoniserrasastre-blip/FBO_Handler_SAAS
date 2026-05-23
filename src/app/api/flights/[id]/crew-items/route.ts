// /api/flights/[id]/crew-items — inventario de crew. `[id]` is the Visit id.

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireWriter } from "@/lib/roles";
import { eventBus } from "@/lib/events";
import { CREW_ITEM_TYPES, CREW_ITEM_LABELS, type CrewItemType } from "@/types";

function labelFor(type: string, customName?: string | null): string {
  if (type === "CUSTOM") return customName || CREW_ITEM_LABELS.CUSTOM;
  return CREW_ITEM_LABELS[type as CrewItemType] ?? type;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const items = await prisma.crewItem.findMany({
    where: { visitId: id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireWriter();
  if (error) return error;

  const { id } = await params;

  let body: { type?: string; customName?: string; quantity?: number; notes?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición no válido" }, { status: 400 });
  }

  if (!body.type || !(CREW_ITEM_TYPES as readonly string[]).includes(body.type)) {
    return NextResponse.json({ error: "Tipo de inventario no válido" }, { status: 400 });
  }

  const quantity = Math.max(1, Math.trunc(body.quantity ?? 1));
  const label = labelFor(body.type, body.customName);

  const item = await prisma.crewItem.create({
    data: {
      visitId: id,
      type: body.type,
      customName: body.customName ?? null,
      quantity,
      state: "STORED",
      notes: body.notes ?? null,
      storedById: session!.user.id,
    },
  });

  await prisma.eventLog.create({
    data: {
      visitId: id,
      userId: session!.user.id,
      action: `Inventario crew guardado: ${label} x${quantity}`,
      details: body.notes ?? null,
    },
  });

  eventBus.emit({
    type: "lost_item_updated",
    flightId: id,
    userId: session!.user.id,
    userName: session!.user.name || undefined,
    detail: `Inventario crew guardado: ${label} x${quantity}`,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json(item, { status: 201 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireWriter();
  if (error) return error;

  const { id } = await params;

  let body: {
    itemId?: string;
    state?: "STORED" | "RETURNED";
    quantity?: number;
    customName?: string;
    notes?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición no válido" }, { status: 400 });
  }

  if (!body.itemId) {
    return NextResponse.json({ error: "Falta itemId" }, { status: 400 });
  }

  const existing = await prisma.crewItem.findUnique({ where: { id: body.itemId } });
  if (!existing || existing.visitId !== id) {
    return NextResponse.json({ error: "Inventario no encontrado" }, { status: 404 });
  }

  const data: {
    state?: string;
    quantity?: number;
    customName?: string | null;
    notes?: string | null;
    returnedAt?: Date | null;
    returnedById?: string | null;
  } = {};

  if (body.state !== undefined) {
    data.state = body.state;
    if (body.state === "RETURNED" && existing.state !== "RETURNED") {
      data.returnedAt = new Date();
      data.returnedById = session!.user.id;
    } else if (body.state === "STORED") {
      data.returnedAt = null;
      data.returnedById = null;
    }
  }
  if (body.quantity !== undefined) data.quantity = Math.max(1, Math.trunc(body.quantity));
  if (body.customName !== undefined) data.customName = body.customName ?? null;
  if (body.notes !== undefined) data.notes = body.notes ?? null;

  const item = await prisma.crewItem.update({
    where: { id: body.itemId },
    data,
  });

  if (body.state === "RETURNED" && existing.state !== "RETURNED") {
    const label = labelFor(item.type, item.customName);
    await prisma.eventLog.create({
      data: {
        visitId: id,
        userId: session!.user.id,
        action: `Inventario crew devuelto: ${label}`,
        details: null,
      },
    });

    eventBus.emit({
      type: "lost_item_updated",
      flightId: id,
      userId: session!.user.id,
      userName: session!.user.name || undefined,
      detail: `Inventario crew devuelto: ${label}`,
      timestamp: new Date().toISOString(),
    });
  }

  return NextResponse.json(item);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireWriter();
  if (error) return error;

  const { id } = await params;

  let body: { itemId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición no válido" }, { status: 400 });
  }

  if (!body.itemId) {
    return NextResponse.json({ error: "Falta itemId" }, { status: 400 });
  }

  const existing = await prisma.crewItem.findUnique({ where: { id: body.itemId } });
  if (!existing || existing.visitId !== id) {
    return NextResponse.json({ error: "Inventario no encontrado" }, { status: 404 });
  }

  await prisma.crewItem.delete({ where: { id: body.itemId } });

  await prisma.eventLog.create({
    data: {
      visitId: id,
      userId: session!.user.id,
      action: "Inventario crew eliminado",
      details: null,
    },
  });

  eventBus.emit({
    type: "lost_item_updated",
    flightId: id,
    userId: session!.user.id,
    userName: session!.user.name || undefined,
    detail: "Inventario crew eliminado",
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
