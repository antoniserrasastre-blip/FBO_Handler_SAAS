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

  // Get today's day sheet (or the specified date)
  const targetDate = date ? new Date(date) : new Date();
  targetDate.setHours(0, 0, 0, 0);

  const daySheet = await prisma.daySheet.findUnique({ where: { date: targetDate } });
  if (!daySheet) {
    return NextResponse.json({ error: "No hay hoja del dia para esta fecha" }, { status: 404 });
  }

  // Get all flights for this day, indexed by registration
  const flights = await prisma.flight.findMany({
    where: { daySheetId: daySheet.id },
    include: { services: true },
  });
  const flightByReg = new Map(flights.map((f) => [f.registration, f]));

  let matched = 0;
  let servicesCreated = 0;
  let notFound: string[] = [];

  for (const extra of extras) {
    const flight = flightByReg.get(extra.registration);
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
