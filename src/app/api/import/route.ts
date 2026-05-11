import "@/lib/pdfPolyfills";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseCybermaxPdf, parseDate } from "@/lib/pdfParser";
import { eventBus } from "@/lib/events";
import { validateUpload, validateContentLength } from "@/lib/uploadValidation";

// POST /api/import — parse one or more Cybermax PDFs
// Returns combined parsed flights for preview (doesn't save yet)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const lenCheck = validateContentLength(req.headers.get("content-length"), "pdf");
  if (!lenCheck.ok) return NextResponse.json({ error: lenCheck.message }, { status: lenCheck.status });

  const formData = await req.formData();
  const files = formData.getAll("pdf") as File[];
  if (!files.length) {
    return NextResponse.json({ error: "No se envio ningun archivo PDF" }, { status: 400 });
  }

  for (const file of files) {
    const v = validateUpload(file, "pdf");
    if (!v.ok) return NextResponse.json({ error: v.message }, { status: v.status });
  }

  const allFlights: Awaited<ReturnType<typeof parseCybermaxPdf>>["flights"] = [];
  const allErrors: string[] = [];
  let date = "";

  for (const file of files) {
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await parseCybermaxPdf(buffer);
      if (!date && result.date) date = result.date;
      allFlights.push(...result.flights);
      if (result.errors?.length) allErrors.push(...result.errors.map((e) => `[${file.name}] ${e}`));
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Error procesando PDF";
      allErrors.push(`[${file.name}] ${msg}`);
    }
  }

  if (!allFlights.length && allErrors.length) {
    return NextResponse.json({ error: allErrors.join("; "), flights: [], errors: allErrors }, { status: 500 });
  }

  return NextResponse.json({ date, flights: allFlights, errors: allErrors });
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
  // Key format: "CALLSIGN|ARRIVAL_DATE" — callsign identifies the movement, date scopes it to the day
  const existingCache = new Map<string, Map<string, { id: string }>>();
  async function getExistingKeyed(daySheetId: string) {
    if (!existingCache.has(daySheetId)) {
      const flights = await prisma.flight.findMany({
        where: { daySheetId },
        select: { id: true, callsign: true, arrivalDate: true },
      });
      const flightMap = new Map(flights.map((f) => {
        const key = `${f.callsign}|${f.arrivalDate || ""}`;
        return [key, f];
      }));
      existingCache.set(daySheetId, flightMap);
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

    const existingByKey = await getExistingKeyed(daySheet.id);
    const flightKey = `${f.callsign}|${f.arrivalDate || date}`;
    const existing = existingByKey.get(flightKey);

    const isOvernight = Boolean(
      f.arrivalDate && f.departureDate && f.arrivalDate !== f.departureDate,
    );

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
      isOvernight,
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
      // Pernoctas whose arrival predates the sheet are already on the ground
      const initialState = isOvernight && flightDate.getTime() < targetDate.getTime() ? "PARKED" : "EXPECTED";
      const flight = await prisma.flight.create({ data: { daySheetId: daySheet.id, registration: f.registration, state: initialState, ...flightData } });
      await prisma.eventLog.create({
        data: { flightId: flight.id, userId: session.user.id, action: "Importado desde PDF", details: `${f.callsign} (${f.registration})` },
      });
      flightId = flight.id;
      existingByKey.set(flightKey, { id: flightId });
      created++;
    }

    // Overnight: if departure date differs from arrival date, create a linked copy on the departure DaySheet
    const depDate = f.departureDate || date;
    if (depDate !== arrDate) {
      const depDateObj = parseDate(depDate);
      const depDaySheet = await getOrCreateDaySheet(depDateObj);
      const depExisting = await getExistingKeyed(depDaySheet.id);
      const depKey = `${f.callsign}|${f.arrivalDate || date}`;

      if (!depExisting.has(depKey)) {
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
            isOvernight: true,
            state: "PARKED",
            linkedFlightId: flightId,
          },
        });
        await prisma.eventLog.create({
          data: { flightId: depFlight.id, userId: session.user.id, action: "Pernocta creada desde PDF", details: `${f.callsign} (${f.registration})` },
        });
        depExisting.set(depKey, { id: depFlight.id });
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
