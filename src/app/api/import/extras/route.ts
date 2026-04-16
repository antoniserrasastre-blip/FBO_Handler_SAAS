import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseExtrasExcel } from "@/lib/excelParser";
import { eventBus } from "@/lib/events";

// POST /api/import/extras — parse an Excel extras file
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("xlsx") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No se envio archivo Excel" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = parseExtrasExcel(buffer);

  return NextResponse.json(result);
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

  // Build lookup maps: both with-dash and without-dash forms
  const flightByReg = new Map<string, typeof flights[0]>();
  for (const f of flights) {
    flightByReg.set(f.registration, f);
    flightByReg.set(f.registration.replace(/-/g, ""), f);
    flightByReg.set(f.registration.toUpperCase(), f);
    flightByReg.set(f.registration.replace(/-/g, "").toUpperCase(), f);
  }

  let matched = 0;
  let servicesCreated = 0;
  let notFound: string[] = [];

  for (const extra of extras) {
    // Try exact match, then without dashes, then uppercase variants
    const reg = extra.registration;
    const flight = flightByReg.get(reg)
      || flightByReg.get(reg.replace(/-/g, ""))
      || flightByReg.get(reg.toUpperCase())
      || flightByReg.get(reg.replace(/-/g, "").toUpperCase());
    if (!flight) {
      notFound.push(extra.registration);
      continue;
    }

    matched++;

    // Create services with proper types
    for (const svc of extra.services) {
      if (!svc.name || svc.name.length < 2) continue;

      for (let i = 0; i < (svc.quantity || 1); i++) {
        await prisma.service.create({
          data: {
            flightId: flight.id,
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

    await prisma.eventLog.create({
      data: {
        flightId: flight.id,
        userId: session.user.id,
        action: `Extras importados desde Excel (${extra.services.length})`,
      },
    });
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
    total: extras.length,
  });
}
