import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { eventBus } from "@/lib/events";
import { requireWriter } from "@/lib/roles";
import { SERVICE_TYPE_DEFAULT_PHASE, type ServiceType, SERVICE_PHASES } from "@/types";

// POST /api/flights/[id]/services — add a service to a flight
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireWriter();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();

  // Resolve phase: trust client value if valid, else fall back to default per service type
  const requestedPhase = typeof body.phase === "string" && (SERVICE_PHASES as readonly string[]).includes(body.phase)
    ? body.phase
    : null;
  const defaultPhase = SERVICE_TYPE_DEFAULT_PHASE[body.type as ServiceType] ?? "DEPARTURE";

  const service = await prisma.service.create({
    data: {
      flightId: id,
      type: body.type,
      phase: requestedPhase ?? defaultPhase,
      customName: body.customName || null,
      reference: body.reference || null,
      origin: body.origin || null,
      target: body.target || null,
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
