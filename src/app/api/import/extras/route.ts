import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseExtrasExcel } from "@/lib/excelParser";
import { palmaDayUtc } from "@/lib/time";
import { validateUpload, validateContentLength } from "@/lib/uploadValidation";
import { eventBus } from "@/lib/events";
import { SERVICE_TYPE_DEFAULT_PHASE, type ServiceType } from "@/types";

// POST /api/import/extras — parse one or more Excel extras files
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const lenCheck = validateContentLength(req.headers.get("content-length"), "xlsx");
  if (!lenCheck.ok) return NextResponse.json({ error: lenCheck.message }, { status: lenCheck.status });

  const formData = await req.formData();
  const files = formData.getAll("xlsx") as File[];
  if (!files.length) {
    return NextResponse.json({ error: "No se envio archivo Excel" }, { status: 400 });
  }

  for (const file of files) {
    const v = validateUpload(file, "xlsx");
    if (!v.ok) return NextResponse.json({ error: v.message }, { status: v.status });
  }

  const allExtras: ReturnType<typeof parseExtrasExcel>["extras"] = [];
  const allErrors: string[] = [];
  let date = "";

  for (const file of files) {
    try {
      const result = parseExtrasExcel(Buffer.from(await file.arrayBuffer()));
      if (!date && result.date) date = result.date;
      for (const extra of result.extras) {
        allExtras.push({ ...extra, date: result.date || undefined });
      }
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
// Supports per-extra dates (multi-file) with fallback to a global date
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { extras, date: globalDate } = body;

  if (!extras || !Array.isArray(extras)) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  function toDateObj(dateStr: string): Date {
    return palmaDayUtc(dateStr);
  }

  // Group extras by date
  const byDate = new Map<string, typeof extras>();
  for (const extra of extras) {
    const d = extra.date || globalDate || new Date().toISOString().slice(0, 10);
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push(extra);
  }

  // Cache DaySheets and flight lookups per date
  const daySheetCache = new Map<string, { id: string }>();
  const flightCache = new Map<string, Map<string, { id: string; services: unknown[] }>>();

  async function getFlightLookup(dateStr: string) {
    if (flightCache.has(dateStr)) return flightCache.get(dateStr)!;

    const targetDate = toDateObj(dateStr);
    let daySheet = await prisma.daySheet.findUnique({ where: { date: targetDate } });
    if (!daySheet) daySheet = await prisma.daySheet.create({ data: { date: targetDate } });
    daySheetCache.set(dateStr, daySheet);

    const flights = await prisma.flight.findMany({
      where: { daySheetId: daySheet.id },
      include: { services: true },
    });

    const lookup = new Map<string, typeof flights[0]>();
    for (const f of flights) {
      lookup.set(f.registration.toUpperCase(), f);
      lookup.set(f.registration.replace(/-/g, "").toUpperCase(), f);
    }

    // Pernoctas: flights from other days departing on this date
    const nearbyFlights = await prisma.flight.findMany({
      where: { daySheetId: { not: daySheet.id }, departureDate: { not: null } },
      include: { services: true },
    });
    const dd = String(targetDate.getDate()).padStart(2, "0");
    const mm = String(targetDate.getMonth() + 1).padStart(2, "0");
    const targetDDMM = `${dd}/${mm}`;
    for (const f of nearbyFlights) {
      if (f.departureDate !== targetDDMM) continue;
      const regUp = f.registration.toUpperCase();
      const regNoDash = regUp.replace(/-/g, "");
      if (!lookup.has(regUp)) lookup.set(regUp, f);
      if (!lookup.has(regNoDash)) lookup.set(regNoDash, f);
    }

    flightCache.set(dateStr, lookup as Map<string, { id: string; services: unknown[] }>);
    return lookup;
  }

  let matched = 0;
  let servicesCreated = 0;
  const notFound: string[] = [];
  const pendingCreated: string[] = [];
  const datesProcessed = new Set<string>();

  for (const [dateStr, dateExtras] of byDate) {
    datesProcessed.add(dateStr);
    const flightByReg = await getFlightLookup(dateStr);
    const daySheet = daySheetCache.get(dateStr)!;

    for (const extra of dateExtras) {
      const reg = extra.registration.toUpperCase();
      const regNoDash = reg.replace(/-/g, "");
      let resolvedFlight = flightByReg.get(reg) || flightByReg.get(regNoDash);
      let wasCreated = false;

      if (!resolvedFlight) {
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
        flightByReg.set(reg, resolvedFlight as typeof resolvedFlight);
      }

      matched++;

      for (const svc of extra.services) {
        if (!svc.name || svc.name.length < 2) continue;
        for (let i = 0; i < (svc.quantity || 1); i++) {
          await prisma.service.create({
            data: {
              flightId: resolvedFlight.id,
              type: svc.type,
              phase: SERVICE_TYPE_DEFAULT_PHASE[svc.type as ServiceType] ?? "DEPARTURE",
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
  }

  const dateList = Array.from(datesProcessed).sort().join(", ");
  eventBus.emit({
    type: "service_created",
    flightId: "import-extras",
    userId: session.user.id,
    userName: session.user.name || undefined,
    detail: `Extras: ${servicesCreated} servicios para ${matched} vuelos (${dateList})`,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({
    matched,
    servicesCreated,
    notFound,
    pendingCreated,
    datesProcessed: Array.from(datesProcessed).sort(),
    total: extras.length,
  });
}
