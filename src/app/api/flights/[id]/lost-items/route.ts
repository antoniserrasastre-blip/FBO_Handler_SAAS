// /api/flights/[id]/lost-items — v2. `[id]` is the Visit id.

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireWriter } from "@/lib/roles";
import { eventBus } from "@/lib/events";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const items = await prisma.lostItem.findMany({
    where: { visitId: id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireWriter();
  if (error) return error;

  const session = await getServerSession(authOptions);
  const { id } = await params;
  const body = await req.json();

  const item = await prisma.lostItem.create({
    data: {
      visitId: id,
      description: body.description,
      location: body.location || "AIRCRAFT",
      foundAt: new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }),
    },
  });

  await prisma.eventLog.create({
    data: {
      visitId: id,
      userId: session!.user.id,
      action: `Objeto encontrado: ${body.description}`,
      details: `Ubicacion: ${body.location || "AIRCRAFT"}`,
    },
  });

  eventBus.emit({
    type: "lost_item_updated",
    flightId: id,
    userId: session!.user.id,
    userName: session!.user.name || undefined,
    detail: `Objeto encontrado: ${body.description}`,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json(item, { status: 201 });
}
