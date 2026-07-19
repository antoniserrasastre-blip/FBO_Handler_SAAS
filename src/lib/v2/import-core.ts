// Pipeline compartido de importación del daily de Cybermax (sprint 03,
// hard-rule #1). Extraído del route /api/import para que la superficie REST
// (POST preview / PUT persist) y la tool MCP import_daily conduzcan el MISMO
// pipeline, parametrizado por userId/userName (el MCP atribuye las escrituras
// al user del token). El route REST queda como wrapper fino con comportamiento
// HTTP byte-idéntico; el MCP jamás duplica el pipeline.

import "@/lib/pdfPolyfills";
import { prisma } from "@/lib/db";
import { parseCybermaxPdf, parseDate } from "@/lib/pdfParser";
import type { ParsedFlight, ParseWarning } from "@/lib/pdfParser";
import { eventBus } from "@/lib/events";
import { upsertAircraft, upsertVisit, upsertMovement, upsertOperator } from "@/lib/v2/upsert";
import { resolveImportState } from "@/lib/v2/resolveImportState";
import { sweepNoShows } from "@/lib/noShowSweep";
import { findOperator } from "@/lib/operators";

/** Pierna candidata a cancelar, para confirmarla UNO A UNO con cancel_movement. */
export interface ToCancelMovement {
  movementId: string;
  direction: "ARRIVAL" | "DEPARTURE";
  flightCategory: string;
}
/**
 * Entrada de reconciliación (visita del día cuya matrícula ya no aparece en el
 * nuevo PDF). Los campos base son los del REST; `movements` es el enriquecido
 * que consume el MCP (el wrapper REST lo retira para quedar byte-idéntico).
 */
export interface ToCancelEntry {
  visitId: string;
  registration: string;
  callsign: string;
  eta: string | null;
  etd: string | null;
  origin: string | null;
  destination: string | null;
  movements: ToCancelMovement[];
}

export interface ImportParse {
  date: string;
  flights: ParsedFlight[];
  errors: string[];
  warnings: ParseWarning[];
}
export interface ImportPreview extends ImportParse {
  toCancel: ToCancelEntry[];
}
export interface ImportPersistResult {
  created: number;
  updated: number;
  cancelled: number;
  noShows: number;
  linked: number;
  total: number;
}

/** Parse multi-buffer (idéntico al bucle del POST): date = primer no vacío,
 *  errores/avisos prefijados con el nombre del archivo, un fallo por archivo
 *  no tumba los demás. */
export async function parseBuffers(
  inputs: Array<{ name: string; buffer: Buffer }>
): Promise<ImportParse> {
  const allFlights: ParsedFlight[] = [];
  const allErrors: string[] = [];
  const allWarnings: ParseWarning[] = [];
  let date = "";

  for (const file of inputs) {
    try {
      const result = await parseCybermaxPdf(file.buffer);
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

  return { date, flights: allFlights, errors: allErrors, warnings: allWarnings };
}

/**
 * Reconciliación: visitas del día del PDF con movimientos que ya no aparecen
 * en el nuevo PDF (candidatas a cancelar), enriquecidas con sus movements para
 * poder confirmarlas una a una. Cero escrituras.
 */
export async function computeToCancel(
  date: string,
  flights: ParsedFlight[]
): Promise<ToCancelEntry[]> {
  if (!date || !flights.length) return [];
  const targetDate = parseDate(date);
  const existing = await prisma.visit.findMany({
    where: { movements: { some: { scheduledDate: targetDate } } },
    include: { aircraft: true, movements: true },
  });
  const parsedRegs = new Set(flights.map((f) => f.registration.toUpperCase()));
  return existing
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
        movements: v.movements.map((m) => ({
          movementId: m.id,
          direction: m.direction as "ARRIVAL" | "DEPARTURE",
          flightCategory: m.flightCategory,
        })),
      };
    });
}

/** Preview = parse + reconciliación. Usado por el POST REST (que retira
 *  `movements` de toCancel) y por el dry-run del MCP (que lo conserva). */
export async function previewImport(
  inputs: Array<{ name: string; buffer: Buffer }>
): Promise<ImportPreview> {
  const parsed = await parseBuffers(inputs);
  const toCancel = await computeToCancel(parsed.date, parsed.flights);
  return { ...parsed, toCancel };
}

/**
 * Persiste los vuelos parseados (camino del PUT), atribuido a userId/userName.
 * `cancelIds` sólo lo pasa el REST; el MCP JAMÁS los pasa (hard-rule #8: el
 * escribano confirma los toCancel uno a uno). Devuelve los contadores crudos;
 * cada wrapper les da forma.
 */
export async function persistImport(args: {
  date: string;
  flights: ParsedFlight[];
  cancelIds?: string[];
  userId: string;
  userName: string | null;
}): Promise<ImportPersistResult> {
  const { date, flights, cancelIds, userId, userName } = args;
  const targetDate = parseDate(date);

  let created = 0;
  let updated = 0;
  let cancelled = 0;

  // Visits ya reclamadas por filas de ESTE import — dos filas del mismo PDF
  // (doble rotación) nunca pueden fundirse en la misma visita.
  const claimedVisitIds = new Set<string>();

  for (const f of flights) {
    const callsign: string = f.callsign;
    const registration: string = f.registration;

    const { arrivalState, departureState, visitDay, visitType } = resolveImportState(
      f.arrivalDate,
      f.departureDate,
      targetDate
    );

    const arrDate = visitDay; // arrival day (= palmaDay de la Visit)
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

    // Visit por avión + palmaDay de llegada, desambiguada por callsign + hora
    // (D-ASIM 18-07): una 2ª rotación del día crea su propia Visit.
    const { record: visit, wasCreated: visitWasCreated } = await upsertVisit({
      aircraftId: aircraft.id,
      palmaDay: arrDate,
      operatorId,
      match: {
        callsigns: [callsign, f.departureCallsign],
        eta: f.eta || null,
        etd: f.etd || null,
        excludeVisitIds: [...claimedVisitIds],
      },
    });
    claimedVisitIds.add(visit.id);

    // Campos de plan de la Visit (siempre se actualizan: son datos del PDF).
    await prisma.visit.update({
      where: { id: visit.id },
      data: {
        type: visitType,
        arrivalDate: arrDate,
        departureDate: depDate,
      },
    });

    // ARRIVAL — state operativo (create-only por la política de upsertMovement).
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
        state: arrivalState,
      },
    });

    // B1-reimport: sólo avanzamos a PARKED con evidencia real de llegada.
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
            userId,
            action: "Auto-transición → PARKED",
            details: "Pernocta confirmada en re-import por evidencia de llegada",
          },
        });
        eventBus.emit({
          type: "flight_updated",
          flightId: visit.id,
          userId,
          userName: userName || undefined,
          detail: "Estado → En plataforma",
          timestamp: new Date().toISOString(),
        });
      }
    }

    // DEPARTURE — siempre EXPECTED al crear (BUG-2).
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
        state: departureState,
      },
    });

    const isUpdate = !visitWasCreated;

    await prisma.eventLog.create({
      data: {
        visitId: visit.id,
        userId,
        action: isUpdate ? "Actualizado desde PDF" : "Importado desde PDF",
        details: `${callsign} (${registration})`,
      },
    });

    if (isUpdate) updated++;
    else created++;
  }

  // Cancelar visits confirmados en el preview (sólo el REST pasa cancelIds).
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
            userId,
            action: "Cancelado: ausente en nuevo PDF",
          },
        });
        cancelled++;
      }
    }
  }

  // B1-noshow: un fallo del sweep no debe tumbar un import ya persistido.
  let noShows = 0;
  if (flights.length > 0) {
    try {
      noShows = await sweepNoShows({ userId });
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
    userId,
    userName: userName || undefined,
    detail: `PDF importado: ${parts.join(", ") || "sin cambios"}`,
    timestamp: new Date().toISOString(),
  });

  return { created, updated, cancelled, noShows, linked: 0, total: flights.length };
}
