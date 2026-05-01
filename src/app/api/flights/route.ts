import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { eventBus } from "@/lib/events";

import { getSpainToday } from "@/lib/time";

// GET /api/flights?date=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dateParam = req.nextUrl.searchParams.get("date");
  let date: Date;
  
  if (dateParam) {
    // Expecting YYYY-MM-DD
    const [y, m, d] = dateParam.split("-").map(Number);
    date = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
  } else {
    date = getSpainToday();
  }

  // Find or create day sheet
  let daySheet = await prisma.daySheet.findUnique({ where: { date } });
  if (!daySheet) {
    daySheet = await prisma.daySheet.create({ data: { date } });
  }

  const rawFlights = await prisma.flight.findMany({
    where: { daySheetId: daySheet.id },
    include: {
      services: { orderBy: { createdAt: "asc" } },
      lostItems: { orderBy: { createdAt: "asc" } },
    },
  });

  // Sort chronologically by "first event today":
  // - Overnight flights (arrived before today): sort by ETD — their only event today
  // - Same-day flights (arrive today): sort by ETA — arrival is the first event
  // - Flights with no time go last
  const flights = rawFlights.sort((a, b) => {
    const ta = a.isOvernight ? (a.etd || "99:99") : (a.eta || a.etd || "99:99");
    const tb = b.isOvernight ? (b.etd || "99:99") : (b.eta || b.etd || "99:99");
    return ta.localeCompare(tb);
  });

  return NextResponse.json({ daySheet, flights });
}

// POST /api/flights — create a new flight
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { date: dateParam, ...flightData } = body;

  let targetDate: Date;
  if (dateParam) {
    // If it's ISO string or YYYY-MM-DD
    const d = new Date(dateParam);
    targetDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
  } else {
    targetDate = getSpainToday();
  }

  // Find or create day sheet
  let daySheet = await prisma.daySheet.findUnique({ where: { date: targetDate } });
  if (!daySheet) {
    daySheet = await prisma.daySheet.create({ data: { date: targetDate } });
  }

  const flight = await prisma.flight.create({
    data: {
      daySheetId: daySheet.id,
      callsign: flightData.callsign,
      registration: flightData.registration,
      aircraftType: flightData.aircraftType,
      origin: flightData.origin || null,
      eta: flightData.eta || null,
      destination: flightData.destination || null,
      etd: flightData.etd || null,
      parking: flightData.parking || null,
      tobt: flightData.tobt || null,
      crewArrival: flightData.crewArrival || 0,
      paxArrival: flightData.paxArrival || 0,
      crewDeparture: flightData.crewDeparture || 0,
      paxDeparture: flightData.paxDeparture || 0,
    },
    include: { services: true, eventLogs: true },
  });

  // Log the creation
  await prisma.eventLog.create({
    data: {
      flightId: flight.id,
      userId: session.user.id,
      action: "Vuelo creado",
      details: `${flight.callsign} - ${flight.registration}`,
    },
  });

  eventBus.emit({
    type: "flight_created",
    flightId: flight.id,
    userId: session.user.id,
    userName: session.user.name || undefined,
    detail: `${flight.callsign} (${flight.registration})`,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json(flight, { status: 201 });
}
