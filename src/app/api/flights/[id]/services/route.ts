import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { eventBus } from "@/lib/events";

// POST /api/flights/[id]/services — add a service to a flight
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const service = await prisma.service.create({
    data: {
      flightId: id,
      type: body.type,
      customName: body.customName || null,
      reference: body.reference || null,
      origin: body.origin || null,
    },
  });

  await prisma.eventLog.create({
    data: {
      flightId: id,
      userId: session.user.id,
      action: `Servicio añadido: ${body.type}${body.customName ? ` (${body.customName})` : ""}`,
    },
  });

  eventBus.emit({
    type: "service_created",
    flightId: id,
    userId: session.user.id,
    userName: session.user.name || undefined,
    detail: `Servicio añadido: ${body.type}`,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json(service, { status: 201 });
}
