// /api/import — Cybermax PDF import. v2 implementation.
//
// POST  → parse + preview (no DB write)
// PUT   → persist parsed flights as Aircraft + Visit + Movement(ARR/DEP)

import "@/lib/pdfPolyfills";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseCybermaxPdf, parseDate } from "@/lib/pdfParser";
import { eventBus } from "@/lib/events";
import { validateUpload, validateContentLength } from "@/lib/uploadValidation";
import { upsertAircraft, upsertVisit, upsertMovement, upsertOperator } from "@/lib/v2/upsert";
import { findOperator } from "@/lib/operators";

// POST — preview
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const lenCheck = validateContentLength(req.headers.get("content-length"), "pdf");
  if (!lenCheck.ok) return NextResponse.json({ error: lenCheck.message }, { status: lenCheck.status });

  const formData = await req.formData();
  const files = formData.getAll("pdf") as File[];
  if (!files.length) return NextResponse.json({ error: "No se envio ningun archivo PDF" }, { status: 400 });

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

  // Reconciliación: vuelos en DB con movimientos en el día del PDF que ya no
  // aparecen en el nuevo PDF (candidatos a cancelar). Se calcula en preview
  // para que el usuario confirme antes de aplicar.
  let toCancel: Array<{
    visitId: string;
    registration: string;
    callsign: string;
    eta: string | null;
    etd: string | null;
    origin: string | null;
    destination: string | null;
  }> = [];
  if (date && allFlights.length) {
    const targetDate = parseDate(date);
    const existing = await prisma.visit.findMany({
      where: { movements: { some: { scheduledDate: targetDate } } },
      include: { aircraft: true, movements: true },
    });
    const parsedRegs = new Set(allFlights.map((f) => f.registration.toUpperCase()));
    toCancel = existing
      .filter((v) => !parsedRegs.has(v.aircraft.registration.toUpperCase()))
      .filter((v) => v.movements.some((m) => m.flightCategory !== "CANCELLED"))
      .map((v) => {
        const arr = v.movements.find((m) => m.direction === "ARRIVAL");
        const dep = v.movements.find((m) => m.direction === "DEPARTURE");
        return {
          visitId: v.id,
          registration: v.aircraft.registration,
          callsign: dep?.callsign || arr?.callsign || "",
          eta: arr?.eta || null,
          etd: dep?.etd || null,
          origin: arr?.origin || null,
          destination: dep?.destination || null,
        };
      });
  }

  return NextResponse.json({ date, flights: allFlights, errors: allErrors, toCancel });
}

// PUT — persist
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { date, flights, cancelIds } = body as {
    date: string;
    flights: unknown[];
    cancelIds?: string[];
  };
  if (!date || !flights || !Array.isArray(flights)) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  const targetDate = parseDate(date);

  let created = 0;
  let updated = 0;
  let cancelled = 0;

  for (const f of flights) {
    const callsign: string = f.callsign;
    const registration: string = f.registration;
    const arrDate = f.arrivalDate ? parseDate(f.arrivalDate) : targetDate;
    const depDate = f.departureDate ? parseDate(f.departureDate) : targetDate;
    const isOvernight = Boolean(
      f.arrivalDate && f.departureDate && f.arrivalDate !== f.departureDate,
    );

    // Operator
    let operatorId: string | null = null;
    const op = findOperator(callsign);
    if (op) {
      const dbOp = await upsertOperator(op.icao, op.name);
      operatorId = dbOp.id;
    }

    // Aircraft
    const aircraft = await upsertAircraft({
      registration,
      aircraftType: f.aircraftType,
      callsignForOperator: callsign,
    });

    // Visit keyed by aircraft + arrival palmaDay. If arrived earlier (pernocta),
    // the visit lives in the arrival's day; the departure leg refers to the same
    // Visit even though it's "on" the target sheet.
    const visit = await upsertVisit({
      aircraftId: aircraft.id,
      palmaDay: arrDate,
      operatorId,
    });

    const isUpdate = visit.createdAt.getTime() !== visit.updatedAt.getTime();

    await prisma.visit.update({
      where: { id: visit.id },
      data: {
        type: isOvernight ? "OVERNIGHT" : "TURNAROUND",
        arrivalDate: arrDate,
        departureDate: depDate,
      },
    });

    // ARRIVAL movement
    await upsertMovement({
      visitId: visit.id,
      direction: "ARRIVAL",
      callsign,
      scheduledDate: arrDate,
      data: {
        origin: f.origin || null,
        eta: f.eta || null,
        parking: f.parking || null,
        paxCount: f.paxArrival || 0,
        crewCount: f.crewArrival || 0,
        // pernocta arrived in the past → already on the ground
        state: isOvernight && arrDate.getTime() < targetDate.getTime() ? "PARKED" : "EXPECTED",
      },
    });

    // DEPARTURE movement
    await upsertMovement({
      visitId: visit.id,
      direction: "DEPARTURE",
      callsign,
      scheduledDate: depDate,
      data: {
        destination: f.destination || null,
        etd: f.etd || null,
        parking: f.parking || null,
        paxCount: f.paxDeparture || 0,
        crewCount: f.crewDeparture || 0,
        state: isOvernight && arrDate.getTime() < targetDate.getTime() ? "PARKED" : "EXPECTED",
      },
    });

    await prisma.eventLog.create({
      data: {
        visitId: visit.id,
        userId: session.user.id,
        action: isUpdate ? "Actualizado desde PDF" : "Importado desde PDF",
        details: `${callsign} (${registration})`,
      },
    });

    if (isUpdate) updated++;
    else created++;
  }

  // Cancelar visits que el usuario confirmó en el preview (no aparecen en el
  // nuevo PDF). Soft-cancel: marcamos todos sus movements como CANCELLED y
  // dejamos registro en eventLog. Servicios, lost items, pax y crew se
  // preservan por si se recuperan.
  if (Array.isArray(cancelIds) && cancelIds.length > 0) {
    for (const id of cancelIds) {
      const res = await prisma.movement.updateMany({
        where: { visitId: id },
        data: { flightCategory: "CANCELLED" },
      });
      if (res.count > 0) {
        await prisma.eventLog.create({
          data: {
            visitId: id,
            userId: session.user.id,
            action: "Cancelado: ausente en nuevo PDF",
          },
        });
        cancelled++;
      }
    }
  }

  const parts = [];
  if (created > 0) parts.push(`${created} nuevos`);
  if (updated > 0) parts.push(`${updated} actualizados`);
  if (cancelled > 0) parts.push(`${cancelled} cancelados`);

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
    cancelled,
    linked: 0,
    total: flights.length,
  });
}
