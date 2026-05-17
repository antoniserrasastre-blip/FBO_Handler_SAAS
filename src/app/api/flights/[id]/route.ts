// /api/flights/[id] — v2 implementation
//
// `id` is the Visit id. PATCH routes each legacy `Flight` field to either the
// ARRIVAL Movement, the DEPARTURE Movement, or the Visit itself via
// `routeFieldToMovement()`.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { eventBus } from "@/lib/events";
import { requireWriter } from "@/lib/roles";
import { suggestNextState } from "@/lib/flightUrgency";
import { FLIGHT_STATE_CONFIG, type FlightState } from "@/types";
import { toFlightView, routeFieldToMovement } from "@/lib/flightView";
import { palmaDayUtc } from "@/lib/time";

const ALLOWED_FLIGHT_PATCH_FIELDS = new Set([
  "callsign", "registration", "aircraftType",
  "origin", "eta", "ata", "arrivalDate",
  "destination", "etd", "atd", "departureDate",
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

async function loadVisit(id: string) {
  return prisma.visit.findUnique({
    where: { id },
    include: {
      aircraft: true,
      movements: true,
      services: true,
      lostItems: true,
    },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireWriter();
  if (error) return error;

  const { id } = await params;
  const rawBody = (await req.json()) as Record<string, unknown>;

  const visit = await loadVisit(id);
  if (!visit) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const previousView = toFlightView(visit);

  // Group patches by target row
  const arrivalUpdates: Record<string, unknown> = {};
  const departureUpdates: Record<string, unknown> = {};
  const visitUpdates: Record<string, unknown> = {};

  for (const key of Object.keys(rawBody)) {
    if (!ALLOWED_FLIGHT_PATCH_FIELDS.has(key)) continue;
    const value = rawBody[key];
    const route = routeFieldToMovement(key);
    if (!route) continue;
    if ("onVisit" in route) {
      if (route.onVisit === "notes") visitUpdates.notes = value;
      else if (route.onVisit === "__isOvernight") {
        visitUpdates.type = value ? "OVERNIGHT" : "TURNAROUND";
      } else if (route.onVisit === "__registration" || route.onVisit === "__aircraftType") {
        // Aircraft-level: handled via separate Aircraft update
        if (route.onVisit === "__aircraftType" && typeof value === "string") {
          await prisma.aircraft.update({
            where: { id: visit.aircraftId },
            data: { aircraftType: value },
          });
        }
      }
      continue;
    }

    const targetBucket = route.direction === "ARRIVAL" ? arrivalUpdates : departureUpdates;
    if (route.field === "__scheduledDate" && typeof value === "string") {
      // Legacy arrivalDate/departureDate strings like "DD/MM"; expand to UTC
      const palmaIso = visit.palmaDay.toISOString().slice(0, 4); // YYYY
      const match = value.match(/^(\d{2})\/(\d{2})$/);
      if (match) {
        const dd = parseInt(match[1], 10);
        const mm = parseInt(match[2], 10);
        targetBucket.scheduledDate = palmaDayUtc(
          `${palmaIso}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`
        );
        if (route.direction === "ARRIVAL") visitUpdates.arrivalDate = targetBucket.scheduledDate;
        else visitUpdates.departureDate = targetBucket.scheduledDate;
      }
    } else {
      targetBucket[route.field] = value;
    }
  }

  // Apply Visit-level updates
  if (Object.keys(visitUpdates).length) {
    await prisma.visit.update({ where: { id }, data: visitUpdates });
  }

  // Apply Movement updates (only if the Movement exists)
  if (Object.keys(arrivalUpdates).length) {
    const arr = visit.movements.find((m) => m.direction === "ARRIVAL");
    if (arr) await prisma.movement.update({ where: { id: arr.id }, data: arrivalUpdates });
  }
  if (Object.keys(departureUpdates).length) {
    const dep = visit.movements.find((m) => m.direction === "DEPARTURE");
    if (dep) await prisma.movement.update({ where: { id: dep.id }, data: departureUpdates });
  }

  // Re-read for auto-transition
  const refreshed = await loadVisit(id);
  if (!refreshed) return NextResponse.json({ error: "Lost during update" }, { status: 500 });
  let flightView = toFlightView(refreshed);

  // Auto-transition only if client didn't change state explicitly
  let autoTransition: FlightState | null = null;
  if (rawBody.state === undefined) {
    autoTransition = suggestNextState(flightView, (refreshed.services || []) as Array<{ phase?: string | null; direction?: string | null; state: string }>);
    if (autoTransition && autoTransition !== flightView.state) {
      const dep = refreshed.movements.find((m) => m.direction === "DEPARTURE");
      if (dep) {
        await prisma.movement.update({ where: { id: dep.id }, data: { state: autoTransition } });
      } else {
        const arr = refreshed.movements.find((m) => m.direction === "ARRIVAL");
        if (arr) await prisma.movement.update({ where: { id: arr.id }, data: { state: autoTransition } });
      }
      const finalRefresh = await loadVisit(id);
      flightView = toFlightView(finalRefresh!);
    } else {
      autoTransition = null;
    }
  }

  // Build event log
  const changes: string[] = [];
  if (rawBody.state && rawBody.state !== previousView.state) changes.push(`Estado → ${rawBody.state}`);
  if (rawBody.fuelState && rawBody.fuelState !== previousView.fuelState) changes.push(`Fuel → ${rawBody.fuelState}`);
  if (rawBody.toiletState && rawBody.toiletState !== previousView.toiletState) changes.push(`Toilet → ${rawBody.toiletState}`);
  if (rawBody.paxDeparture !== undefined && rawBody.paxDeparture !== previousView.paxDeparture) changes.push(`Pax salida: ${rawBody.paxDeparture}`);
  if (rawBody.paxArrival !== undefined && rawBody.paxArrival !== previousView.paxArrival) changes.push(`Pax llegada: ${rawBody.paxArrival}`);
  if (rawBody.eta !== undefined && rawBody.eta !== previousView.eta) changes.push(`ETA: ${previousView.eta || "--"} → ${rawBody.eta || "--"}`);
  if (rawBody.etd !== undefined && rawBody.etd !== previousView.etd) changes.push(`ETD: ${previousView.etd || "--"} → ${rawBody.etd || "--"}`);
  if (rawBody.tobt !== undefined && rawBody.tobt !== previousView.tobt) changes.push(`TOBT: ${previousView.tobt || "--"} → ${rawBody.tobt || "--"}`);
  if (rawBody.parking !== undefined && rawBody.parking !== previousView.parking) changes.push(`Parking: ${previousView.parking || "--"} → ${rawBody.parking || "--"}`);
  if (rawBody.notes !== undefined && rawBody.notes !== previousView.notes) changes.push(rawBody.notes ? `Nota actualizada` : `Nota eliminada`);
  if (autoTransition) changes.push(`Auto-transición → ${FLIGHT_STATE_CONFIG[autoTransition].label}`);

  if (changes.length > 0) {
    await prisma.eventLog.create({
      data: { visitId: id, userId: session.user.id, action: changes.join(", ") },
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

  return NextResponse.json(flightView);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireWriter();
  if (error) return error;

  const { id } = await params;
  const visit = await loadVisit(id);
  if (!visit) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const view = toFlightView(visit);
  await prisma.visit.delete({ where: { id } });

  eventBus.emit({
    type: "flight_deleted",
    flightId: id,
    userId: session.user.id,
    userName: session.user.name || undefined,
    detail: `${view.callsign} eliminado`,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
