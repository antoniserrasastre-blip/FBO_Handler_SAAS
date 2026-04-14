import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { eventBus } from "@/lib/events";

// PATCH /api/flights/[id] — update a flight
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  // Build log entries for significant changes
  const existing = await prisma.flight.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const flight = await prisma.flight.update({
    where: { id },
    data: body,
    include: {
      services: { orderBy: { createdAt: "asc" } },
      eventLogs: {
        orderBy: { timestamp: "desc" },
        take: 20,
        include: { user: { select: { name: true } } },
      },
    },
  });

  // Build a human-readable description of what changed
  const changes: string[] = [];
  if (body.state && body.state !== existing.state) changes.push(`Estado → ${body.state}`);
  if (body.fuelState && body.fuelState !== existing.fuelState) changes.push(`Fuel → ${body.fuelState}`);
  if (body.toiletState && body.toiletState !== existing.toiletState) changes.push(`Toilet → ${body.toiletState}`);
  if (body.paxDeparture !== undefined && body.paxDeparture !== existing.paxDeparture) changes.push(`Pax salida: ${body.paxDeparture}`);
  if (body.paxArrival !== undefined && body.paxArrival !== existing.paxArrival) changes.push(`Pax llegada: ${body.paxArrival}`);
  if (body.crewArrival !== undefined && body.crewArrival !== existing.crewArrival) changes.push(`Crew llegada: ${body.crewArrival}`);
  if (body.crewDeparture !== undefined && body.crewDeparture !== existing.crewDeparture) changes.push(`Crew salida: ${body.crewDeparture}`);
  if (body.paxDepBagsState && body.paxDepBagsState !== existing.paxDepBagsState) changes.push(`Maletas → ${body.paxDepBagsState}`);
  if (body.paxDepTransportState && body.paxDepTransportState !== existing.paxDepTransportState) changes.push(`Transporte → ${body.paxDepTransportState}`);
  if (body.crewArrLocation && body.crewArrLocation !== existing.crewArrLocation) changes.push(`Crew lleg. → ${body.crewArrLocation}`);
  if (body.crewDepLocation && body.crewDepLocation !== existing.crewDepLocation) changes.push(`Crew sal. → ${body.crewDepLocation}`);

  // Log all changes in a single event
  if (changes.length > 0) {
    await prisma.eventLog.create({
      data: {
        flightId: id,
        userId: session.user.id,
        action: changes.join(", "),
      },
    });
  }

  eventBus.emit({
    type: "flight_updated",
    flightId: id,
    userId: session.user.id,
    userName: session.user.name || undefined,
    detail: changes.join(", ") || "Actualizado",
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json(flight);
}

// DELETE /api/flights/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const flight = await prisma.flight.findUnique({ where: { id } });
  await prisma.flight.delete({ where: { id } });

  eventBus.emit({
    type: "flight_deleted",
    flightId: id,
    userId: session.user.id,
    userName: session.user.name || undefined,
    detail: flight ? `${flight.callsign} eliminado` : "Vuelo eliminado",
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
