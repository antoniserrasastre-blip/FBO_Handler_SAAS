// /api/import — Cybermax PDF import. v2 implementation.
//
// POST  → parse + preview (no DB write)
// PUT   → persist parsed flights as Aircraft + Visit + Movement(ARR/DEP)

import "@/lib/pdfPolyfills";
import { NextRequest, NextResponse } from "next/server";
import { requireWriter } from "@/lib/roles";
import { prisma } from "@/lib/db";
import { parseCybermaxPdf, parseDate } from "@/lib/pdfParser";
import type { ParseWarning } from "@/lib/pdfParser";
import { eventBus } from "@/lib/events";
import { validateUpload, validateContentLength } from "@/lib/uploadValidation";
import { upsertAircraft, upsertVisit, upsertMovement, upsertOperator } from "@/lib/v2/upsert";
import { resolveImportState } from "@/lib/v2/resolveImportState";
import { sweepNoShows } from "@/lib/noShowSweep";
import { findOperator } from "@/lib/operators";

// POST — preview
export async function POST(req: NextRequest) {
  const { error } = await requireWriter();
  if (error) return error;

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
  const allWarnings: ParseWarning[] = [];
  let date = "";

  for (const file of files) {
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await parseCybermaxPdf(buffer);
      if (!date && result.date) date = result.date;
      allFlights.push(...result.flights);
      if (result.errors?.length) allErrors.push(...result.errors.map((e) => `[${file.name}] ${e}`));
      if (result.warnings?.length) {
        allWarnings.push(
          ...result.warnings.map((w) => ({ row: w.row, reason: `[${file.name}] ${w.reason}` }))
        );
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Error procesando PDF";
      allErrors.push(`[${file.name}] ${msg}`);
    }
  }

  if (!allFlights.length && allErrors.length) {
    return NextResponse.json({ error: allErrors.join("; "), flights: [], errors: allErrors, warnings: allWarnings }, { status: 500 });
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

  return NextResponse.json({ date, flights: allFlights, errors: allErrors, warnings: allWarnings, toCancel });
}

// PUT — persist
export async function PUT(req: NextRequest) {
  const { session, error } = await requireWriter();
  if (error) return error;

  type ParsedFlightInput = Awaited<ReturnType<typeof parseCybermaxPdf>>["flights"][number];
  const body = await req.json();
  const { date, flights, cancelIds } = body as {
    date: string;
    flights: ParsedFlightInput[];
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

    // Derive all state/date decisions from the pure helper (BUG-2 + BUG-3 fix).
    const {
      isOvernight: _isOvernight,
      arrivalState,
      departureState,
      visitDay,
      visitType,
    } = resolveImportState(f.arrivalDate, f.departureDate, targetDate);

    const arrDate = visitDay; // arrival day (= palmaDay for the Visit)
    const depDate = f.departureDate ? parseDate(f.departureDate) : targetDate;

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
    const { record: visit, wasCreated: visitWasCreated } = await upsertVisit({
      aircraftId: aircraft.id,
      palmaDay: arrDate,
      operatorId,
    });

    // Visit plan fields (type, arrivalDate, departureDate) are always updated —
    // these are PDF plan data, not handler-editable operational fields.
    await prisma.visit.update({
      where: { id: visit.id },
      data: {
        type: visitType,
        arrivalDate: arrDate,
        departureDate: depDate,
      },
    });

    // ARRIVAL movement — state is operational (PARKED for overnight, EXPECTED otherwise).
    // On re-import the state is preserved by upsertMovement's plan-only update policy.
    const { record: arrMovement, wasCreated: arrWasCreated } = await upsertMovement({
      visitId: visit.id,
      direction: "ARRIVAL",
      callsign,
      scheduledDate: arrDate,
      data: {
        origin: f.origin || null,
        eta: f.eta || null,
        paxCount: f.paxArrival || 0,
        crewCount: f.crewArrival || 0,
        parking: f.parking || null,
        // state is operational — only set on create, never overwritten on update
        state: arrivalState,
      },
    });

    // B1-reimport: el PDF de hoy puede listar como pernocta un visit cuyo
    // ARRIVAL sigue EXPECTED (posible no-show de días anteriores). Decisión:
    // NO avanzamos a PARKED salvo evidencia real de llegada (ata o livePhase
    // LANDED/ON_BLOCKS) — "que el PDF lo dé por aparcado" no es evidencia.
    // Sin evidencia queda EXPECTED y sweepNoShows() lo resolverá al cierre.
    if (!arrWasCreated && arrivalState === "PARKED" && arrMovement.state === "EXPECTED") {
      const hasArrivalEvidence =
        Boolean(arrMovement.ata) ||
        arrMovement.livePhase === "LANDED" ||
        arrMovement.livePhase === "ON_BLOCKS";
      if (hasArrivalEvidence) {
        await prisma.movement.update({
          where: { id: arrMovement.id },
          data: { state: "PARKED" },
        });
        await prisma.eventLog.create({
          data: {
            visitId: visit.id,
            movementId: arrMovement.id,
            userId: session.user.id,
            action: "Auto-transición → PARKED",
            details: "Pernocta confirmada en re-import por evidencia de llegada",
          },
        });
        eventBus.emit({
          type: "flight_updated",
          flightId: visit.id,
          userId: session.user.id,
          userName: session.user.name || undefined,
          detail: "Estado → En plataforma",
          timestamp: new Date().toISOString(),
        });
      }
    }

    // DEPARTURE movement — always starts EXPECTED (BUG-2 fix: was using arrivalState
    // for both, which left overnight departures as PARKED).
    await upsertMovement({
      visitId: visit.id,
      direction: "DEPARTURE",
      callsign: f.departureCallsign || callsign,
      scheduledDate: depDate,
      data: {
        destination: f.destination || null,
        etd: f.etd || null,
        paxCount: f.paxDeparture || 0,
        crewCount: f.crewDeparture || 0,
        parking: f.parking || null,
        // state is operational — always EXPECTED for departure on create
        state: departureState,
      },
    });

    // Use wasCreated from upsertVisit for accurate EventLog labelling (BUG-6 fix).
    // The old heuristic (createdAt !== updatedAt) gave false positives after backfill updates.
    const isUpdate = !visitWasCreated;

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

  // B1-noshow: al cierre del import diario, marca NO_SHOW los ARRIVAL
  // EXPECTED viejos sin evidencia de llegada. Un fallo del sweep no debe
  // tumbar un import que ya persistió — se loguea y se sigue.
  let noShows = 0;
  if (flights.length > 0) {
    try {
      noShows = await sweepNoShows({ userId: session.user.id });
    } catch (e) {
      console.error("sweepNoShows tras import falló:", e);
    }
  }

  const parts = [];
  if (created > 0) parts.push(`${created} nuevos`);
  if (updated > 0) parts.push(`${updated} actualizados`);
  if (cancelled > 0) parts.push(`${cancelled} cancelados`);
  if (noShows > 0) parts.push(`${noShows} no-show`);

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
    noShows,
    linked: 0,
    total: flights.length,
  });
}
