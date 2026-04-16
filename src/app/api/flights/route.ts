import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { eventBus } from "@/lib/events";

// GET /api/flights?date=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dateParam = req.nextUrl.searchParams.get("date");
  const date = dateParam ? new Date(dateParam) : new Date();
  date.setHours(0, 0, 0, 0);

  // Find or create day sheet
  let daySheet = await prisma.daySheet.findUnique({ where: { date } });
  if (!daySheet) {
    daySheet = await prisma.daySheet.create({ data: { date } });
  }

  const flights = await prisma.flight.findMany({
    where: { daySheetId: daySheet.id },
    include: {
      services: { orderBy: { createdAt: "asc" } },
      lostItems: { orderBy: { createdAt: "asc" } },
    },
    orderBy: { eta: "asc" },
  });

  return NextResponse.json({ daySheet, flights });
}

// POST /api/flights — create a new flight
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { date, ...flightData } = body;

  const targetDate = date ? new Date(date) : new Date();
  targetDate.setHours(0, 0, 0, 0);

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
