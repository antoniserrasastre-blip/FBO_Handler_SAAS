// /api/import — Cybermax PDF import. v2 implementation.
//
// POST  → parse PDF + diff against existing Visits on the target palmaDay.
//         Returns three lists: toCreate / toUpdate / toCancel so the UI can
//         show an explicit sync preview before any DB write.
// PUT   → execute an array of explicit per-row actions (create | update |
//         cancel | ignore). "cancel" marks both Movements as CANCELLED — it
//         never deletes a Visit, so attached services/passengers/state survive.

import "@/lib/pdfPolyfills";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseCybermaxPdf, parseDate, type ParsedFlight } from "@/lib/pdfParser";
import { eventBus } from "@/lib/events";
import { validateUpload, validateContentLength } from "@/lib/uploadValidation";
import { upsertAircraft, upsertVisit, upsertMovement, upsertOperator } from "@/lib/v2/upsert";
import { findOperator } from "@/lib/operators";

// Fields shown to the user in the "to update" diff. Keys are the parsed-PDF
// names; the resolver below maps each one to the equivalent DB value so we
// can compare them.
const DIFF_FIELDS = [
  "callsign",
  "origin",
  "eta",
  "destination",
  "etd",
  "parking",
  "aircraftType",
  "crewArrival",
  "crewDeparture",
  "paxArrival",
  "paxDeparture",
] as const;
type DiffField = (typeof DIFF_FIELDS)[number];

// A movement is "in progress" (and thus protected from a sync-cancel) when the
// handler has done any operational work that wouldn't make sense to discard.
function isMovementInProgress(m: {
  state: string;
  ata: string | null;
  atd: string | null;
  paxState: string;
  bagsState: string;
  fuelState: string;
  toiletState: string;
}): boolean {
  if (m.state && m.state !== "EXPECTED") return true;
  if (m.ata || m.atd) return true;
  if (m.paxState && !["IN_AIRCRAFT", "NOT_ARRIVED"].includes(m.paxState)) return true;
  if (m.bagsState && !["IN_AIRCRAFT", "NOT_ARRIVED"].includes(m.bagsState)) return true;
  if (m.fuelState && m.fuelState !== "NOT_REQUESTED") return true;
  if (m.toiletState && m.toiletState !== "NOT_REQUESTED") return true;
  return false;
}

interface DiffRow {
  registration: string;
  callsign: string;
  flight: ParsedFlight;
}

interface UpdateDiffRow extends DiffRow {
  visitId: string;
  changes: { field: DiffField; from: string | number | null; to: string | number | null }[];
}

interface CancelCandidateRow {
  visitId: string;
  registration: string;
  callsign: string;
  source: string;                  // PDF | MANUAL | EXTRAS
  hasServices: boolean;
  hasPassengers: boolean;
  inProgress: boolean;
  protectedReason: string | null;  // null when the row is safe to cancel
}

// POST — parse + diff (no DB write)
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

  const allFlights: ParsedFlight[] = [];
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
    return NextResponse.json(
      { error: allErrors.join("; "), flights: [], errors: allErrors, diff: null },
      { status: 500 },
    );
  }

  // Compute diff against existing visits on this Palma operating day.
  //
  // Match key is (registration, arrivalCallsign) — never (registration) alone.
  // The same aircraft can do two distinct turnarounds in a single day with
  // different callsigns; folding them by registration would lose one.
  //
  // The DB-side scope includes both:
  //   - Visits whose palmaDay == targetDate (today's arrivals)
  //   - Visits whose departureDate == targetDate and palmaDay < targetDate
  //     (pernoctas leaving today — they're listed on today's PDF too)
  const targetDate = date ? parseDate(date) : null;
  const diff: {
    toCreate: DiffRow[];
    toUpdate: UpdateDiffRow[];
    toCancel: CancelCandidateRow[];
  } = { toCreate: [], toUpdate: [], toCancel: [] };

  if (targetDate) {
    const existing = await prisma.visit.findMany({
      where: {
        OR: [
          { palmaDay: targetDate },
          { departureDate: targetDate, palmaDay: { lt: targetDate } },
        ],
      },
      include: {
        aircraft: true,
        movements: true,
        services: { select: { id: true } },
      },
    });

    // Passenger counts come from a separate aggregate query so the include
    // above stays flat.
    const visitsWithCounts = await Promise.all(
      existing.map(async (v) => {
        const pax = await prisma.passenger.count({
          where: { movement: { visitId: v.id } },
        });
        return { v, paxCount: pax };
      }),
    );

    // Helper: build a stable compound key for a visit. Prefer the ARRIVAL
    // callsign; fall back to DEPARTURE for pernoctas / departure-only rows.
    function visitKey(v: (typeof visitsWithCounts)[number]["v"]): string {
      const reg = v.aircraft?.registration?.toUpperCase().trim() || "";
      const arr = v.movements.find((m) => m.direction === "ARRIVAL");
      const dep = v.movements.find((m) => m.direction === "DEPARTURE");
      const cs = (arr?.callsign || dep?.callsign || "").toUpperCase().trim();
      return `${reg}::${cs}`;
    }
    function pdfKey(f: ParsedFlight): string {
      const reg = f.registration.toUpperCase().trim();
      const cs = (f.callsign || f.departureCallsign || "").toUpperCase().trim();
      return `${reg}::${cs}`;
    }

    // Index DB visits by compound key. Multimap-ish: if two visits collide on
    // the same key (extremely rare: identical reg + identical callsign), we
    // keep them as an array so we can match them positionally to PDF rows.
    const byKey = new Map<string, (typeof visitsWithCounts)[number][]>();
    for (const row of visitsWithCounts) {
      const key = visitKey(row.v);
      const bucket = byKey.get(key);
      if (bucket) bucket.push(row);
      else byKey.set(key, [row]);
    }

    // Aircrafts that the PDF mentions at all — orphan adoption (see below).
    const seenRegs = new Set<string>(
      allFlights.map((f) => f.registration.toUpperCase().trim()),
    );
    const seenKeys = new Set<string>();
    const usedVisitIds = new Set<string>();

    for (const f of allFlights) {
      const key = pdfKey(f);
      seenKeys.add(key);
      const bucket = byKey.get(key) || [];
      const match = bucket.find((r) => !usedVisitIds.has(r.v.id));
      if (!match) {
        diff.toCreate.push({ registration: f.registration, callsign: f.callsign, flight: f });
        continue;
      }
      usedVisitIds.add(match.v.id);
      const changes = computeChanges(f, match.v.movements);
      if (changes.length > 0) {
        diff.toUpdate.push({
          registration: f.registration,
          callsign: f.callsign,
          flight: f,
          visitId: match.v.id,
          changes,
        });
      }
    }

    // Cancellation candidates: any DB visit not matched by a PDF row.
    // Two extra exclusions on top of "already cancelled":
    //   - Orphan visits (no Movements) for an aircraft the PDF still
    //     mentions: upsertVisit will adopt the orphan on PUT, so cancelling
    //     it would be wrong. (Same logic that keeps EXTRAS services linked.)
    for (const { v, paxCount } of visitsWithCounts) {
      if (usedVisitIds.has(v.id)) continue;

      const dep = v.movements.find((m) => m.direction === "DEPARTURE");
      const arr = v.movements.find((m) => m.direction === "ARRIVAL");
      const isCancelled = (dep?.flightCategory || arr?.flightCategory) === "CANCELLED";
      if (isCancelled) continue;

      const reg = v.aircraft?.registration?.toUpperCase().trim() || "";
      const isOrphan = v.movements.length === 0;
      if (isOrphan && seenRegs.has(reg)) continue; // will be adopted

      const inProgress =
        (dep ? isMovementInProgress(dep as unknown as Parameters<typeof isMovementInProgress>[0]) : false) ||
        (arr ? isMovementInProgress(arr as unknown as Parameters<typeof isMovementInProgress>[0]) : false);

      let protectedReason: string | null = null;
      if (v.source && v.source !== "PDF") protectedReason = `Origen: ${v.source}`;
      else if (inProgress) protectedReason = "Operativa en curso";

      diff.toCancel.push({
        visitId: v.id,
        registration: v.aircraft?.registration || "",
        callsign: (arr?.callsign as string) || (dep?.callsign as string) || "",
        source: v.source || "MANUAL",
        hasServices: v.services.length > 0,
        hasPassengers: paxCount > 0,
        inProgress,
        protectedReason,
      });
    }
  }

  return NextResponse.json({ date, flights: allFlights, errors: allErrors, diff });
}

// Compute per-field changes between a parsed PDF row and the current DB state.
function computeChanges(
  f: ParsedFlight,
  movements: { direction: string; [k: string]: unknown }[],
): UpdateDiffRow["changes"] {
  const arr = movements.find((m) => m.direction === "ARRIVAL");
  const dep = movements.find((m) => m.direction === "DEPARTURE");

  const dbValues: Record<DiffField, string | number | null> = {
    callsign: (dep?.callsign as string) || (arr?.callsign as string) || null,
    origin: (arr?.origin as string | null) ?? null,
    eta: (arr?.eta as string | null) ?? null,
    destination: (dep?.destination as string | null) ?? null,
    etd: (dep?.etd as string | null) ?? null,
    parking: ((dep?.parking as string | null) || (arr?.parking as string | null)) ?? null,
    aircraftType: null, // filled by caller via aircraft if needed; not on movement
    crewArrival: (arr?.crewCount as number) ?? 0,
    crewDeparture: (dep?.crewCount as number) ?? 0,
    paxArrival: (arr?.paxCount as number) ?? 0,
    paxDeparture: (dep?.paxCount as number) ?? 0,
  };

  const pdfValues: Record<DiffField, string | number | null> = {
    callsign: f.callsign || null,
    origin: f.origin || null,
    eta: f.eta || null,
    destination: f.destination || null,
    etd: f.etd || null,
    parking: f.parking || null,
    aircraftType: f.aircraftType || null,
    crewArrival: f.crewArrival || 0,
    crewDeparture: f.crewDeparture || 0,
    paxArrival: f.paxArrival || 0,
    paxDeparture: f.paxDeparture || 0,
  };

  const out: UpdateDiffRow["changes"] = [];
  for (const field of DIFF_FIELDS) {
    if (field === "aircraftType") continue; // skip: not tracked on Movement
    const a = normalize(dbValues[field]);
    const b = normalize(pdfValues[field]);
    if (a !== b) out.push({ field, from: dbValues[field], to: pdfValues[field] });
  }
  return out;
}

function normalize(v: string | number | null): string {
  if (v === null || v === undefined) return "";
  return typeof v === "number" ? String(v) : v.trim().toUpperCase();
}

// ============================================================================
// PUT — execute explicit per-row actions
// ============================================================================

interface SyncCreate { action: "create"; flight: ParsedFlight }
interface SyncUpdate { action: "update"; flight: ParsedFlight }
interface SyncCancel { action: "cancel"; visitId: string }
type SyncAction = SyncCreate | SyncUpdate | SyncCancel;

interface LegacyBody {
  date: string;
  flights?: ParsedFlight[];           // legacy path (no diff yet)
  actions?: SyncAction[];             // new diff-based sync
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as LegacyBody;
  const { date } = body;
  if (!date) return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });

  // Build the action list. Legacy callers still send `flights: [...]` — treat
  // each one as an upsert (create-or-update) so behaviour stays identical.
  const actions: SyncAction[] = [];
  if (Array.isArray(body.actions)) {
    actions.push(...body.actions);
  } else if (Array.isArray(body.flights)) {
    for (const f of body.flights) actions.push({ action: "update", flight: f });
  } else {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  const targetDate = parseDate(date);

  let created = 0;
  let updated = 0;
  let cancelled = 0;
  let skipped = 0;

  for (const a of actions) {
    if (a.action === "cancel") {
      const result = await cancelVisit(a.visitId, session.user.id);
      if (result === "cancelled") cancelled++;
      else skipped++;
      continue;
    }

    const f = a.flight;
    const callsign: string = f.callsign;
    const registration: string = f.registration;
    const arrDate = f.arrivalDate ? parseDate(f.arrivalDate) : targetDate;
    const depDate = f.departureDate ? parseDate(f.departureDate) : targetDate;
    const isOvernight = Boolean(
      f.arrivalDate && f.departureDate && f.arrivalDate !== f.departureDate,
    );

    let operatorId: string | null = null;
    const op = findOperator(callsign);
    if (op) {
      const dbOp = await upsertOperator(op.icao, op.name);
      operatorId = dbOp.id;
    }

    const aircraft = await upsertAircraft({
      registration,
      aircraftType: f.aircraftType,
      callsignForOperator: callsign,
    });

    const visit = await upsertVisit({
      aircraftId: aircraft.id,
      palmaDay: arrDate,
      operatorId,
      source: "PDF",
      legCallsign: callsign,
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
        state: isOvernight && arrDate.getTime() < targetDate.getTime() ? "PARKED" : "EXPECTED",
        // If the visit was previously CANCELLED, re-importing un-cancels it.
        flightCategory: "COMMERCIAL",
      },
    });

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
        flightCategory: "COMMERCIAL",
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
    skipped,
    linked: 0,
    total: actions.length,
  });
}

// Mark every Movement of a Visit as CANCELLED. Returns "cancelled" on success
// or "skipped" if the visit doesn't exist or was already cancelled. Never
// deletes — services, passengers, lost items and event logs all survive.
async function cancelVisit(visitId: string, userId: string): Promise<"cancelled" | "skipped"> {
  const visit = await prisma.visit.findUnique({
    where: { id: visitId },
    include: { movements: true, aircraft: true },
  });
  if (!visit) return "skipped";
  const allCancelled = visit.movements.every((m) => m.flightCategory === "CANCELLED");
  if (allCancelled) return "skipped";

  await prisma.movement.updateMany({
    where: { visitId },
    data: { flightCategory: "CANCELLED" },
  });
  await prisma.eventLog.create({
    data: {
      visitId,
      userId,
      action: "Cancelado por sync de PDF",
      details: `${visit.movements[0]?.callsign || ""} (${visit.aircraft?.registration || ""})`,
    },
  });
  return "cancelled";
}
