import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseExtrasExcel } from "@/lib/excelParser";
import { eventBus } from "@/lib/events";

// POST /api/import/extras — parse one or more Excel extras files
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const files = formData.getAll("xlsx") as File[];
  if (!files.length) {
    return NextResponse.json({ error: "No se envio archivo Excel" }, { status: 400 });
  }

  const allExtras: ReturnType<typeof parseExtrasExcel>["extras"] = [];
  const allErrors: string[] = [];
  let date = "";

  for (const file of files) {
    try {
      const result = parseExtrasExcel(Buffer.from(await file.arrayBuffer()));
      if (!date && result.date) date = result.date;
      allExtras.push(...result.extras);
      if (result.errors?.length) allErrors.push(...result.errors.map((e: string) => `[${file.name}] ${e}`));
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Error procesando Excel";
      allErrors.push(`[${file.name}] ${msg}`);
    }
  }

  if (!allExtras.length && allErrors.length) {
    return NextResponse.json({ error: allErrors.join("; "), extras: [], errors: allErrors }, { status: 500 });
  }

  return NextResponse.json({ date, extras: allExtras, errors: allErrors });
}

// PUT /api/import/extras — confirm and save extras to flights
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { extras, date } = body;

  if (!extras || !Array.isArray(extras)) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  // Build the target date at local midnight
  let targetDate: Date;
  if (date) {
    // Accept YYYY-MM-DD format from the date picker
    const parts = date.split("-");
    if (parts.length === 3) {
      targetDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    } else {
      targetDate = new Date(date);
    }
  } else {
    targetDate = new Date();
  }
  targetDate.setHours(0, 0, 0, 0);

  const daySheet = await prisma.daySheet.findUnique({ where: { date: targetDate } });
  if (!daySheet) {
    return NextResponse.json({ error: `No hay hoja del dia para ${targetDate.toLocaleDateString("es-ES")}` }, { status: 404 });
  }

  // Get all flights for this day, indexed by registration (normalized without dashes)
  const flights = await prisma.flight.findMany({
    where: { daySheetId: daySheet.id },
    include: { services: true },
  });

  // Build lookup map: both with-dash and without-dash forms
  const flightByReg = new Map<string, typeof flights[0]>();
  for (const f of flights) {
    flightByReg.set(f.registration.toUpperCase(), f);
    flightByReg.set(f.registration.replace(/-/g, "").toUpperCase(), f);
  }

  // Also search nearby days (pernoctas: flights that arrived earlier but depart on this date)
  const nearbyFlights = await prisma.flight.findMany({
    where: {
      daySheetId: { not: daySheet.id },
      departureDate: { not: null },
    },
    include: { services: true },
  });
  // Only add if not already in today's map — prefer today's flights
  for (const f of nearbyFlights) {
    const depDate = f.departureDate;
    if (!depDate) continue;
    // Check if departureDate matches our target (DD/MM format)
    const dd = String(targetDate.getDate()).padStart(2, "0");
    const mm = String(targetDate.getMonth() + 1).padStart(2, "0");
    const targetDDMM = `${dd}/${mm}`;
    if (depDate !== targetDDMM) continue;
    const regUp = f.registration.toUpperCase();
    const regNoDash = regUp.replace(/-/g, "");
    if (!flightByReg.has(regUp)) flightByReg.set(regUp, f);
    if (!flightByReg.has(regNoDash)) flightByReg.set(regNoDash, f);
  }

  let matched = 0;
  let servicesCreated = 0;
  let notFound: string[] = [];
  let pendingCreated: string[] = [];

  for (const extra of extras) {
    // Try exact match, then without dashes, then uppercase variants
    const reg = extra.registration.toUpperCase();
    const regNoDash = reg.replace(/-/g, "");
    const flight = flightByReg.get(reg) || flightByReg.get(regNoDash);
    let wasCreated = false;
    let resolvedFlight = flight;

    if (!resolvedFlight) {
      // Create a placeholder flight for unmatched registrations
      resolvedFlight = await prisma.flight.create({
        data: {
          daySheetId: daySheet.id,
          callsign: "---",
          registration: extra.registration,
          aircraftType: "---",
          state: "EXPECTED",
        },
        include: { services: true },
      });
      await prisma.eventLog.create({
        data: {
          flightId: resolvedFlight.id,
          userId: session.user.id,
          action: `Vuelo creado desde extras (matricula no encontrada en orden del dia)`,
        },
      });
      wasCreated = true;
      pendingCreated.push(extra.registration);
    }

    matched++;

    // Create services with proper types
    for (const svc of extra.services) {
      if (!svc.name || svc.name.length < 2) continue;

      for (let i = 0; i < (svc.quantity || 1); i++) {
        await prisma.service.create({
          data: {
            flightId: resolvedFlight.id,
            type: svc.type,
            customName: svc.type === "CUSTOM" ? svc.name : (svc.name !== svc.type ? svc.name : null),
            state: "PENDING",
            reference: svc.reference || null,
            target: svc.target || null,
            origin: svc.origin || null,
          },
        });
        servicesCreated++;
      }
    }

    if (!wasCreated) {
      await prisma.eventLog.create({
        data: {
          flightId: resolvedFlight.id,
          userId: session.user.id,
          action: `Extras importados desde Excel (${extra.services.length})`,
        },
      });
    }
  }

  eventBus.emit({
    type: "service_created",
    flightId: "import-extras",
    userId: session.user.id,
    userName: session.user.name || undefined,
    detail: `Extras: ${servicesCreated} servicios para ${matched} vuelos`,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({
    matched,
    servicesCreated,
    notFound,
    pendingCreated,
    total: extras.length,
  });
}
