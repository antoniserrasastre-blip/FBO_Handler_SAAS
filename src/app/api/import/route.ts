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

  // Find existing flights to merge (match by registration — aircraft is unique per day)
  const existingFlights = await prisma.flight.findMany({
    where: { daySheetId: daySheet.id },
    select: { id: true, callsign: true, registration: true },
  });
  const existingByReg = new Map(
    existingFlights.map((f) => [f.registration, f])
  );

  let created = 0;
  let updated = 0;

  for (const f of flights) {
    const existing = existingByReg.get(f.registration);

    if (existing) {
      // Update existing flight with new data from PDF
      await prisma.flight.update({
        where: { id: existing.id },
        data: {
          callsign: f.callsign,
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
          flightId: existing.id,
          userId: session.user.id,
          action: "Actualizado desde PDF",
          details: `${f.callsign} (${f.registration})`,
        },
      });

      updated++;
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

  const parts = [];
  if (created > 0) parts.push(`${created} nuevos`);
  if (updated > 0) parts.push(`${updated} actualizados`);

  eventBus.emit({
    type: "flight_created",
    flightId: "import",
    userId: session.user.id,
    userName: session.user.name || undefined,
    detail: `PDF importado: ${parts.join(", ") || "sin cambios"}`,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({
    created,
    updated,
    total: flights.length,
  });
}
