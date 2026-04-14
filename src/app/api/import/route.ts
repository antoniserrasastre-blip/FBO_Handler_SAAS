import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseCybermaxPdf, parseDate } from "@/lib/pdfParser";
import { eventBus } from "@/lib/events";

// POST /api/import — parse a Cybermax PDF
// Returns parsed flights for preview (doesn't save yet)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("pdf") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No se envio ningun archivo PDF" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await parseCybermaxPdf(buffer);

  return NextResponse.json(result);
}

// PUT /api/import — confirm and save parsed flights
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { date, flights } = body;

  if (!date || !flights || !Array.isArray(flights)) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  const targetDate = parseDate(date);

  // Find or create day sheet
  let daySheet = await prisma.daySheet.findUnique({ where: { date: targetDate } });
  if (!daySheet) {
    daySheet = await prisma.daySheet.create({ data: { date: targetDate } });
  }

  // Check for duplicates by callsign+registration
  const existingFlights = await prisma.flight.findMany({
    where: { daySheetId: daySheet.id },
    select: { callsign: true, registration: true },
  });
  const existingSet = new Set(
    existingFlights.map((f) => `${f.callsign}:${f.registration}`)
  );

  let created = 0;
  let skipped = 0;

  for (const f of flights) {
    const key = `${f.callsign}:${f.registration}`;
    if (existingSet.has(key)) {
      skipped++;
      continue;
    }

    const flight = await prisma.flight.create({
      data: {
        daySheetId: daySheet.id,
        callsign: f.callsign,
        registration: f.registration,
        aircraftType: f.aircraftType,
        origin: f.origin,
        eta: f.eta,
        destination: f.destination,
        etd: f.etd,
        parking: f.parking,
        crewArrival: f.crewArrival || 0,
        crewDeparture: f.crewDeparture || 0,
        paxArrival: f.paxArrival || 0,
        paxDeparture: f.paxDeparture || 0,
      },
    });

    await prisma.eventLog.create({
      data: {
        flightId: flight.id,
        userId: session.user.id,
        action: "Importado desde PDF",
        details: `${f.callsign} (${f.registration})`,
      },
    });

    created++;
  }

  eventBus.emit({
    type: "flight_created",
    flightId: "import",
    userId: session.user.id,
    userName: session.user.name || undefined,
    detail: `Importados ${created} vuelos desde PDF`,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({
    created,
    skipped,
    total: flights.length,
  });
}
