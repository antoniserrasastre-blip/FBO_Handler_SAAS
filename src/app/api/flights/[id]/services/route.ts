// POST /api/flights/[id]/services — add a service to a visit.
// `[id]` is the Visit id; Services hang from Visit (not Movement) in v2.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { eventBus } from "@/lib/events";
import { requireWriter } from "@/lib/roles";
import { SERVICE_TYPE_DEFAULT_PHASE, type ServiceType, SERVICE_PHASES } from "@/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireWriter();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();

  // Resolve direction (legacy field name: `phase`)
  const requestedDir = typeof body.phase === "string" && (SERVICE_PHASES as readonly string[]).includes(body.phase)
    ? body.phase
    : typeof body.direction === "string" && (SERVICE_PHASES as readonly string[]).includes(body.direction)
      ? body.direction
      : null;
  const defaultDir = SERVICE_TYPE_DEFAULT_PHASE[body.type as ServiceType] ?? "DEPARTURE";

  const service = await prisma.service.create({
    data: {
      visitId: id,
      type: body.type,
      direction: requestedDir ?? defaultDir,
      customName: body.customName || null,
      reference: body.reference || null,
      origin: body.origin || null,
      target: body.target || null,
      quantity: body.quantity || 1,
    },
  });

  await prisma.eventLog.create({
    data: {
      visitId: id,
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

  // Surface `phase` alias for legacy UI
  return NextResponse.json({ ...service, phase: service.direction }, { status: 201 });
}
