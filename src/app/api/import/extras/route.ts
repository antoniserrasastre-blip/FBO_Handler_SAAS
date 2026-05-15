// /api/import/extras — Excel "extras" import. v2 implementation.
//
// Cross-references by aircraft registration against the Visits of the target
// Palma operating day. If no Visit exists yet (Excel arrived before the
// Cybermax PDF), an orphan Visit is created — it will be enriched when the
// PDF later imports.

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseExtrasExcel } from "@/lib/excelParser";
import { palmaDayUtc } from "@/lib/time";
import { validateUpload, validateContentLength } from "@/lib/uploadValidation";
import { eventBus } from "@/lib/events";
import { SERVICE_TYPE_DEFAULT_PHASE, type ServiceType } from "@/types";
import { upsertAircraft, upsertVisit } from "@/lib/v2/upsert";

const ORIGIN_MAP: Record<string, string> = {
  NetJets: "NETJETS",
  "Catering Aire": "CATERING_AIRE",
  MCR: "MCR",
};

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const lenCheck = validateContentLength(req.headers.get("content-length"), "xlsx");
  if (!lenCheck.ok) return NextResponse.json({ error: lenCheck.message }, { status: lenCheck.status });

  const formData = await req.formData();
  const files = formData.getAll("xlsx") as File[];
  if (!files.length) return NextResponse.json({ error: "No se envio archivo Excel" }, { status: 400 });

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
      for (const extra of result.extras) allExtras.push({ ...extra, date: result.date || undefined });
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

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { extras, date: globalDate } = body;
  if (!extras || !Array.isArray(extras)) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  // Group extras by date
  const byDate = new Map<string, typeof extras>();
  for (const extra of extras) {
    const d = extra.date || globalDate || new Date().toISOString().slice(0, 10);
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push(extra);
  }

  let matched = 0;
  let servicesCreated = 0;
  const pendingCreated: string[] = [];
  const datesProcessed = new Set<string>();

  for (const [dateStr, dateExtras] of byDate) {
    datesProcessed.add(dateStr);
    const palmaDay = palmaDayUtc(dateStr);

    // Build a lookup of Visits for this Palma day, keyed by registration.
    const visitsToday = await prisma.visit.findMany({
      where: { palmaDay },
      include: { aircraft: true },
    });
    const visitByReg = new Map<string, { id: string; aircraftId: string }>();
    for (const v of visitsToday) {
      const reg = v.aircraft.registration.toUpperCase();
      visitByReg.set(reg, v);
      visitByReg.set(reg.replace(/-/g, ""), v);
    }

    // Pernoctas: Visits from earlier days whose departureDate falls on this day
    const pernoctaVisits = await prisma.visit.findMany({
      where: {
        palmaDay: { not: palmaDay },
        departureDate: palmaDay,
      },
      include: { aircraft: true },
    });
    for (const v of pernoctaVisits) {
      const reg = v.aircraft.registration.toUpperCase();
      if (!visitByReg.has(reg)) visitByReg.set(reg, v);
      if (!visitByReg.has(reg.replace(/-/g, ""))) visitByReg.set(reg.replace(/-/g, ""), v);
    }

    for (const extra of dateExtras) {
      const reg = extra.registration.toUpperCase();
      const regNoDash = reg.replace(/-/g, "");
      let visit = visitByReg.get(reg) || visitByReg.get(regNoDash);

      if (!visit) {
        // Orphan: create Aircraft + Visit, no Movements yet.
        const aircraft = await upsertAircraft({ registration: extra.registration });
        visit = await upsertVisit({ aircraftId: aircraft.id, palmaDay });
        pendingCreated.push(extra.registration);
        visitByReg.set(reg, visit);
        await prisma.eventLog.create({
          data: {
            visitId: visit.id,
            userId: session.user.id,
            action: "Visit creada desde extras (matricula no encontrada en orden del dia)",
          },
        });
      }

      matched++;

      for (const svc of extra.services) {
        if (!svc.name || svc.name.length < 2) continue;
        for (let i = 0; i < (svc.quantity || 1); i++) {
          await prisma.service.create({
            data: {
              visitId: visit.id,
              type: svc.type,
              direction: SERVICE_TYPE_DEFAULT_PHASE[svc.type as ServiceType] ?? "DEPARTURE",
              customName: svc.type === "CUSTOM" ? svc.name : (svc.name !== svc.type ? svc.name : null),
              state: "PENDING",
              reference: svc.reference || null,
              target: svc.target || null,
              origin: svc.origin ? (ORIGIN_MAP[svc.origin] || "OTHER") : null,
              rawDescription: svc.name,
              quantity: 1,
            },
          });
          servicesCreated++;
        }
      }

      await prisma.eventLog.create({
        data: {
          visitId: visit.id,
          userId: session.user.id,
          action: `Extras importados desde Excel (${extra.services.length})`,
        },
      });
    }
  }

  const dateList = Array.from(datesProcessed).sort().join(", ");
  eventBus.emit({
    type: "service_created",
    flightId: "import-extras",
    userId: session.user.id,
    userName: session.user.name || undefined,
    detail: `Extras: ${servicesCreated} servicios para ${matched} visitas (${dateList})`,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({
    matched,
    servicesCreated,
    notFound: [],
    pendingCreated,
    datesProcessed: Array.from(datesProcessed).sort(),
    total: extras.length,
  });
}
