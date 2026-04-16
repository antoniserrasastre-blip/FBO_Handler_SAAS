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

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await parseCybermaxPdf(buffer);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error procesando PDF";
    return NextResponse.json({ error: message, flights: [], errors: [message] }, { status: 500 });
  }
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

  // Helper: find or create a DaySheet for a given date
  async function getOrCreateDaySheet(d: Date) {
    let ds = await prisma.daySheet.findUnique({ where: { date: d } });
    if (!ds) ds = await prisma.daySheet.create({ data: { date: d } });
    return ds;
  }

  // Primary day sheet (from the PDF header date)
  const primaryDaySheet = await getOrCreateDaySheet(targetDate);

  // Cache of existing flights per daySheet for dedup
  const existingCache = new Map<string, Map<string, { id: string }>>();
  async function getExistingByReg(daySheetId: string) {
    if (!existingCache.has(daySheetId)) {
      const flights = await prisma.flight.findMany({
        where: { daySheetId },
        select: { id: true, registration: true },
      });
      existingCache.set(daySheetId, new Map(flights.map((f) => [f.registration, f])));
    }
    return existingCache.get(daySheetId)!;
  }

  let created = 0;
  let updated = 0;
  let linked = 0;

  for (const f of flights) {
    // Determine which DaySheet this flight belongs to based on arrival date
    const arrDate = f.arrivalDate || date;
    const flightDate = parseDate(arrDate);
    const daySheet = flightDate.getTime() === targetDate.getTime()
      ? primaryDaySheet
      : await getOrCreateDaySheet(flightDate);

    const existingByReg = await getExistingByReg(daySheet.id);
    const existing = existingByReg.get(f.registration);

    const flightData = {
      callsign: f.callsign,
      aircraftType: f.aircraftType,
      origin: f.origin,
      eta: f.eta,
      arrivalDate: f.arrivalDate || null,
      destination: f.destination,
      etd: f.etd,
      departureDate: f.departureDate || null,
      parking: f.parking,
      crewArrival: f.crewArrival || 0,
      crewDeparture: f.crewDeparture || 0,
      paxArrival: f.paxArrival || 0,
      paxDeparture: f.paxDeparture || 0,
    };

    let flightId: string;

    if (existing) {
      await prisma.flight.update({ where: { id: existing.id }, data: flightData });
      await prisma.eventLog.create({
        data: { flightId: existing.id, userId: session.user.id, action: "Actualizado desde PDF", details: `${f.callsign} (${f.registration})` },
      });
      flightId = existing.id;
      updated++;
    } else {
      const flight = await prisma.flight.create({ data: { daySheetId: daySheet.id, registration: f.registration, ...flightData } });
      await prisma.eventLog.create({
        data: { flightId: flight.id, userId: session.user.id, action: "Importado desde PDF", details: `${f.callsign} (${f.registration})` },
      });
      flightId = flight.id;
      existingByReg.set(f.registration, { id: flightId });
      created++;
    }

    // Overnight: if departure date differs from arrival date, create a linked copy on the departure DaySheet
    const depDate = f.departureDate || date;
    if (depDate !== arrDate) {
      const depDateObj = parseDate(depDate);
      const depDaySheet = await getOrCreateDaySheet(depDateObj);
      const depExisting = await getExistingByReg(depDaySheet.id);

      if (!depExisting.has(f.registration)) {
        const depFlight = await prisma.flight.create({
          data: {
            daySheetId: depDaySheet.id,
            callsign: f.callsign,
            registration: f.registration,
            aircraftType: f.aircraftType,
            origin: f.origin,
            eta: f.eta,
            arrivalDate: f.arrivalDate || null,
            destination: f.destination,
            etd: f.etd,
            departureDate: f.departureDate || null,
            parking: f.parking,
            crewArrival: f.crewArrival || 0,
            crewDeparture: f.crewDeparture || 0,
            paxArrival: f.paxArrival || 0,
            paxDeparture: f.paxDeparture || 0,
            linkedFlightId: flightId,
          },
        });
        await prisma.eventLog.create({
          data: { flightId: depFlight.id, userId: session.user.id, action: "Pernocta creada desde PDF", details: `${f.callsign} (${f.registration})` },
        });
        depExisting.set(f.registration, { id: depFlight.id });
        linked++;
      }
    }
  }

  const parts = [];
  if (created > 0) parts.push(`${created} nuevos`);
  if (updated > 0) parts.push(`${updated} actualizados`);
  if (linked > 0) parts.push(`${linked} pernoctas`);

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
    linked,
    total: flights.length,
  });
}
