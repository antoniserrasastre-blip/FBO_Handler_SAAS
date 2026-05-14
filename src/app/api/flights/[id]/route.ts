import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { eventBus } from "@/lib/events";
import { requireWriter, requireAdmin } from "@/lib/roles";
import { suggestNextState } from "@/lib/flightUrgency";
import { FLIGHT_STATE_CONFIG, type FlightState } from "@/types";

const ALLOWED_FLIGHT_PATCH_FIELDS = new Set([
  "callsign", "registration", "aircraftType",
  "origin", "eta", "arrivalDate",
  "destination", "etd", "departureDate",
  "parking", "tobt",
  "state", "isOvernight",
  "crewArrival", "crewArrivalReal", "paxArrival", "paxArrivalReal",
  "crewDeparture", "crewDepartureReal", "paxDeparture", "paxDepartureReal",
  "paxArrBagsChecked", "paxArrBagsCabin", "paxArrBagsState",
  "paxArrTransportType", "paxArrTransportState", "paxArrState",
  "paxDepBagsChecked", "paxDepBagsCabin", "paxDepBagsState",
  "paxDepTransportType", "paxDepTransportState", "paxDepState",
  "crewArrLocation", "crewDepLocation",
  "fuelState", "fuelRequestedAt", "fuelServedAt",
  "toiletState", "toiletRequestedAt", "toiletCompletedAt",
  "linkedFlightId", "notes",
]);

function pickAllowed(body: Record<string, unknown>, allowed: Set<string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(body)) {
    if (allowed.has(key)) out[key] = body[key];
  }
  return out;
}

// PATCH /api/flights/[id] — update a flight
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireWriter();
  if (error) return error;

  const { id } = await params;
  const rawBody = await req.json();
  const body = pickAllowed(rawBody, ALLOWED_FLIGHT_PATCH_FIELDS);

  const existing = await prisma.flight.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let flight = await prisma.flight.update({
    where: { id },
    data: body as Prisma.FlightUpdateInput,
    include: {
      services: { orderBy: { createdAt: "asc" } },
    },
  });

  // Auto-transición de estado: solo si el cliente NO está cambiando explícitamente el estado
  let autoTransition: FlightState | null = null;
  if (body.state === undefined) {
    autoTransition = suggestNextState(flight, flight.services);
    if (autoTransition && autoTransition !== flight.state) {
      flight = await prisma.flight.update({
        where: { id },
        data: { state: autoTransition },
        include: { services: { orderBy: { createdAt: "asc" } } },
      });
    } else {
      autoTransition = null;
    }
  }

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
  if (body.eta !== undefined && body.eta !== existing.eta) changes.push(`ETA: ${existing.eta || "--"} → ${body.eta || "--"}`);
  if (body.etd !== undefined && body.etd !== existing.etd) changes.push(`ETD: ${existing.etd || "--"} → ${body.etd || "--"}`);
  if (body.tobt !== undefined && body.tobt !== existing.tobt) changes.push(`TOBT: ${existing.tobt || "--"} → ${body.tobt || "--"}`);
  if (body.parking !== undefined && body.parking !== existing.parking) changes.push(`Parking: ${existing.parking || "--"} → ${body.parking || "--"}`);
  if (body.origin !== undefined && body.origin !== existing.origin) changes.push(`Origen: ${existing.origin || "--"} → ${body.origin || "--"}`);
  if (body.destination !== undefined && body.destination !== existing.destination) changes.push(`Destino: ${existing.destination || "--"} → ${body.destination || "--"}`);
  if (body.notes !== undefined && body.notes !== existing.notes) changes.push(body.notes ? `Nota actualizada` : `Nota eliminada`);
  if (autoTransition) changes.push(`Auto-transición → ${FLIGHT_STATE_CONFIG[autoTransition].label}`);

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
  const { session, error } = await requireWriter();
  if (error) return error;

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
