// /api/flights — v2 implementation
//
// Reads Visits + Movements for the given Palma operating day and projects them
// through `toFlightView()` so the UI keeps consuming the same shape as before.
// POST creates a Visit + an empty DEPARTURE Movement (the typical case for
// manual "quick add" entries).

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { eventBus } from "@/lib/events";
import { palmaDayUtc, getSpainToday } from "@/lib/time";
import { upsertAircraft, upsertVisit, upsertMovement, upsertOperator } from "@/lib/v2/upsert";
import { toFlightView } from "@/lib/flightView";
import { findOperator } from "@/lib/operators";
import { decrypt } from "@/lib/crypto";

// GET /api/flights?date=YYYY-MM-DD[&include=people]
//
// `include=people` returns passengers + crew alongside each flight so the
// VisitCard can render the encrypted PII row in one round-trip.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dateParam = req.nextUrl.searchParams.get("date");
  const includePeople = req.nextUrl.searchParams.get("include") === "people";
  const palmaDay = dateParam ? palmaDayUtc(dateParam) : getSpainToday();

  const visits = await prisma.visit.findMany({
    where: { palmaDay },
    include: {
      aircraft: true,
      movements: includePeople
        ? {
            include: {
              passengers: { orderBy: { createdAt: "asc" } },
              crewAssignments: { include: { crewMember: true } },
            },
          }
        : true,
      services: { orderBy: { createdAt: "asc" } },
      lostItems: { orderBy: { createdAt: "asc" } },
    },
  });

  const flights = visits.map(toFlightView);

  // Build a side-channel { [visitId]: { passengers, crew } } so the FlightView
  // shape stays stable. Decryption happens server-side here; the wire payload
  // already carries cleartext passport numbers (over TLS).
  let people: Record<string, { passengers: unknown[]; crew: unknown[]; paxSource: string | null }> = {};
  if (includePeople) {
    people = {};
    for (const v of visits) {
      const passengers: unknown[] = [];
      const crew: unknown[] = [];
      let paxSource: string | null = null;
      for (const m of v.movements as unknown as Array<{
        id: string;
        direction: string;
        passengers: Array<{ id: string; givenNames: string | null; surname: string | null; passportEncrypted: string | null; nationality: string | null; status: string; verified: boolean; source: string }>;
        crewAssignments: Array<{ crewMemberId: string; roleOnFlight: string; crewMember: { fullName: string; passportEncrypted: string | null; nationality: string | null } }>;
      }>) {
        for (const p of m.passengers || []) {
          if (!paxSource) paxSource = p.source;
          passengers.push({
            id: p.id,
            direction: m.direction,
            fullName: [p.givenNames, p.surname].filter(Boolean).join(" ") || "",
            nationality: p.nationality,
            passportNumber: p.passportEncrypted ? decrypt(p.passportEncrypted) : null,
            status: p.status,
            verified: p.verified,
          });
        }
        for (const a of m.crewAssignments || []) {
          crew.push({
            id: `${m.id}__${a.crewMemberId}`,
            direction: m.direction,
            fullName: a.crewMember.fullName,
            role: a.roleOnFlight,
            passportNumber: a.crewMember.passportEncrypted ? decrypt(a.crewMember.passportEncrypted) : null,
            nationality: a.crewMember.nationality,
          });
        }
      }
      people[v.id] = { passengers, crew, paxSource };
    }
  }

  // Sort chronologically: pernoctas (arrived earlier) by ETD; same-day by ETA→ETD
  const iso = palmaDay.toISOString().slice(2, 10).split("-").reverse().join("/");
  flights.sort((a, b) => {
    const arrivedBeforeA = !!a.arrivalDate && a.arrivalDate !== iso;
    const arrivedBeforeB = !!b.arrivalDate && b.arrivalDate !== iso;
    const ta = arrivedBeforeA ? (a.etd || "99:99") : (a.eta || a.etd || "99:99");
    const tb = arrivedBeforeB ? (b.etd || "99:99") : (b.eta || b.etd || "99:99");
    return ta.localeCompare(tb);
  });

  // Shape mirrors the legacy endpoint: { daySheet, flights, [people] }
  return NextResponse.json({
    daySheet: { id: palmaDay.toISOString(), date: palmaDay },
    flights,
    ...(includePeople ? { people } : {}),
  });
}

// POST /api/flights — create a new visit + departure movement
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { date: dateParam, ...flightData } = body;

  const palmaDay = dateParam ? palmaDayUtc(dateParam) : getSpainToday();

  // Operator from callsign (best-effort)
  let operatorId: string | null = null;
  if (flightData.callsign) {
    const op = findOperator(flightData.callsign);
    if (op) {
      const dbOp = await upsertOperator(op.icao, op.name);
      operatorId = dbOp.id;
    }
  }

  const aircraft = await upsertAircraft({
    registration: flightData.registration,
    aircraftType: flightData.aircraftType,
    callsignForOperator: flightData.callsign,
  });

  const visit = await upsertVisit({
    aircraftId: aircraft.id,
    palmaDay,
    operatorId,
  });

  // Create DEPARTURE movement (manual quick-adds typically capture the departure leg)
  const depMovement = await upsertMovement({
    visitId: visit.id,
    direction: "DEPARTURE",
    callsign: flightData.callsign,
    scheduledDate: palmaDay,
    data: {
      destination: flightData.destination || null,
      etd: flightData.etd || null,
      parking: flightData.parking || null,
      tobt: flightData.tobt || null,
      paxCount: flightData.paxDeparture || 0,
      crewCount: flightData.crewDeparture || 0,
    },
  });

  // Create ARRIVAL movement only if origin/eta were provided
  if (flightData.origin || flightData.eta) {
    await upsertMovement({
      visitId: visit.id,
      direction: "ARRIVAL",
      callsign: flightData.callsign,
      scheduledDate: palmaDay,
      data: {
        origin: flightData.origin || null,
        eta: flightData.eta || null,
        parking: flightData.parking || null,
        paxCount: flightData.paxArrival || 0,
        crewCount: flightData.crewArrival || 0,
      },
    });
  }

  await prisma.eventLog.create({
    data: {
      visitId: visit.id,
      movementId: depMovement.id,
      userId: session.user.id,
      action: "Vuelo creado",
      details: `${flightData.callsign} - ${flightData.registration}`,
    },
  });

  eventBus.emit({
    type: "flight_created",
    flightId: visit.id,
    userId: session.user.id,
    userName: session.user.name || undefined,
    detail: `${flightData.callsign} (${flightData.registration})`,
    timestamp: new Date().toISOString(),
  });

  // Re-read visit with relations and project to FlightView
  const refreshed = await prisma.visit.findUnique({
    where: { id: visit.id },
    include: {
      aircraft: true,
      movements: true,
      services: true,
      lostItems: true,
    },
  });
  return NextResponse.json(refreshed ? toFlightView(refreshed) : null, { status: 201 });
}
