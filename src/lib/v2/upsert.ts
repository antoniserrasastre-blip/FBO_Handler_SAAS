// Idempotent upsert helpers for the v2 domain. Keep them small and side-effect
// free except for the Prisma writes — callers compose them.

import { prisma } from "@/lib/db";
import { findOperator } from "@/lib/operators";
import { palmaDayUtc } from "@/lib/time";

// ---------------------------------------------------------------------------
// Operational fields on a Movement that must NEVER be overwritten by a
// re-import.  These are fields that handlers can edit in the UI after the
// initial import.  "Plan" fields (callsign, scheduledDate, origin, destination,
// eta, etd, crewCount) ARE updated on every reimport.
// ---------------------------------------------------------------------------
export const MOVEMENT_OPERATIONAL_FIELDS = new Set([
  "state",
  "paxCount",
  "paxCountReal",
  "parking",
  "paxState",
  "bagsState",
  "fuelState",
  "fuelRequestedAt",
  "fuelServedAt",
  "toiletState",
  "toiletRequestedAt",
  "toiletCompletedAt",
  "bagsChecked",
  "bagsCabin",
  "transportType",
  "transportState",
  "crewLocation",
  "ata",
  "atd",
  "tobt",
]);

/**
 * Find or create an Aircraft by registration. When the registration is new,
 * the operator is resolved from a callsign (best-effort: NetJets PDF / Cybermax
 * PDF give us the callsign at import time).
 */
export async function upsertAircraft(args: {
  registration: string;
  aircraftType?: string | null;
  callsignForOperator?: string | null;
}) {
  const reg = args.registration.toUpperCase().trim();
  const existing = await prisma.aircraft.findUnique({ where: { registration: reg } });
  if (existing) {
    // aircraftType is PLAN data — always update if the PDF brings a new value.
    // This covers both backfill (was null) and corrections (PDF updated the type).
    // NOTE: operatorId/operator.name update is deferred (low priority, separate increment).
    if (args.aircraftType && existing.aircraftType !== args.aircraftType) {
      return prisma.aircraft.update({
        where: { id: existing.id },
        data: { aircraftType: args.aircraftType },
      });
    }
    return existing;
  }

  let operatorId: string | null = null;
  if (args.callsignForOperator) {
    const op = findOperator(args.callsignForOperator);
    if (op) {
      const dbOp = await upsertOperator(op.icao, op.name);
      operatorId = dbOp.id;
    }
  }

  return prisma.aircraft.create({
    data: {
      registration: reg,
      aircraftType: args.aircraftType || null,
      currentOperatorId: operatorId,
    },
  });
}

/** Find or create an Operator by ICAO code. */
export async function upsertOperator(icaoCode: string, name: string) {
  const code = icaoCode.toUpperCase().trim();
  return prisma.operator.upsert({
    where: { icaoCode: code },
    create: { icaoCode: code, name },
    update: { name },
  });
}

/**
 * Identity hint to match an incoming row against one of possibly SEVERAL
 * Visits of the same aircraft on the same day (double rotations).
 * Anchor: callsign + hora — registration alone cannot tell rotations apart.
 */
export interface VisitMatchHint {
  /** Callsigns of the row (arrival and/or departure leg). */
  callsigns?: Array<string | null | undefined>;
  /** Scheduled HH:MM Zulu times of the row's legs. */
  eta?: string | null;
  etd?: string | null;
  /** Visits already claimed by other rows of the same import run — a row can
   *  never merge into a visit a sibling row already owns. */
  excludeVisitIds?: string[];
}

/**
 * Max distance (minutes) between the row's scheduled time and an existing
 * movement's for both to count as the same rotation when the callsign changed
 * (daily correction / errata). Beyond it the row is a new rotation.
 */
export const ROTATION_TIME_TOLERANCE_MIN = 90;

function hhmmToMinutes(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(t.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Minutes between two HH:MM times, wrapping around midnight; null if unparseable. */
export function timeDelta(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null;
  const ma = hhmmToMinutes(a);
  const mb = hhmmToMinutes(b);
  if (ma === null || mb === null) return null;
  const diff = Math.abs(ma - mb);
  return Math.min(diff, 1440 - diff);
}

type VisitWithMovements = Awaited<ReturnType<typeof prisma.visit.create>> & {
  movements: Array<{ direction: string; callsign: string; eta: string | null; etd: string | null }>;
};

/**
 * Find or create a Visit for a given aircraft on a given Palma operating day.
 *
 * Without a `match` hint one aircraft/day is one visit (first found wins),
 * mirroring the old Flight semantics — enrichment callers (netjets-pax,
 * extras) rely on this and attach to the first rotation of the day.
 *
 * With a `match` hint (daily import, quick-add) rotations are told apart by
 * callsign + hora: a visit whose movements share a callsign with the row is
 * the same rotation; failing that, one whose scheduled times fall within
 * ROTATION_TIME_TOLERANCE_MIN is the same rotation with a corrected callsign;
 * failing both, the row is a NEW rotation and gets its own Visit. Before this
 * (18-07-2026) the second rotation of the day silently overwrote the first
 * (D-ASIM lost its real arrival/departure).
 *
 * Returns `{ record, wasCreated }` so callers can distinguish first import
 * from re-import without relying on the timestamp heuristic (BUG-6 fix).
 */
export async function upsertVisit(args: {
  aircraftId: string;
  palmaDay: Date | string;
  operatorId?: string | null;
  match?: VisitMatchHint;
}): Promise<{ record: Awaited<ReturnType<typeof prisma.visit.create>>; wasCreated: boolean }> {
  const palmaDay = args.palmaDay instanceof Date ? args.palmaDay : palmaDayUtc(args.palmaDay);

  const existing = args.match
    ? await findVisitByRotation(args.aircraftId, palmaDay, args.match)
    : await prisma.visit.findFirst({
        where: { aircraftId: args.aircraftId, palmaDay },
      });

  if (existing) {
    if (!existing.operatorId && args.operatorId) {
      const updated = await prisma.visit.update({
        where: { id: existing.id },
        data: { operatorId: args.operatorId },
      });
      return { record: updated, wasCreated: false };
    }
    return { record: existing, wasCreated: false };
  }
  const created = await prisma.visit.create({
    data: {
      aircraftId: args.aircraftId,
      operatorId: args.operatorId || null,
      palmaDay,
    },
  });
  return { record: created, wasCreated: true };
}

/** Pick the visit of the day that IS this row's rotation, or null for "new rotation". */
async function findVisitByRotation(
  aircraftId: string,
  palmaDay: Date,
  match: VisitMatchHint
): Promise<Awaited<ReturnType<typeof prisma.visit.create>> | null> {
  const excluded = new Set(match.excludeVisitIds || []);
  const visits = (
    (await prisma.visit.findMany({
      where: { aircraftId, palmaDay },
      include: {
        movements: { select: { direction: true, callsign: true, eta: true, etd: true } },
      },
      orderBy: { createdAt: "asc" },
    })) as VisitWithMovements[]
  ).filter((v) => !excluded.has(v.id));
  if (!visits.length) return null;

  const stripMovements = (v: VisitWithMovements) => {
    const { movements: _movements, ...record } = v;
    return record;
  };

  const callsigns = new Set(
    (match.callsigns || [])
      .filter((c): c is string => Boolean(c))
      .map((c) => c.toUpperCase().trim())
  );
  if (callsigns.size) {
    const byCallsign = visits.find((v) =>
      v.movements.some((m) => callsigns.has(m.callsign.toUpperCase().trim()))
    );
    if (byCallsign) return stripMovements(byCallsign);
  }

  // No callsign in common — same rotation only if the scheduled times line up
  // (corrected callsign). Pick the closest visit within tolerance.
  let best: { visit: VisitWithMovements; delta: number } | null = null;
  for (const v of visits) {
    for (const m of v.movements) {
      const delta =
        m.direction === "ARRIVAL" ? timeDelta(match.eta, m.eta) : timeDelta(match.etd, m.etd);
      if (delta === null || delta > ROTATION_TIME_TOLERANCE_MIN) continue;
      if (!best || delta < best.delta) best = { visit: v, delta };
    }
  }
  return best ? stripMovements(best.visit) : null;
}

/**
 * Find or create a Movement (ARRIVAL or DEPARTURE) attached to a Visit.
 * Idempotent on (visitId, direction) — the unique constraint enforces 1+1 max.
 *
 * Policy: on UPDATE (re-import), only PLAN fields are written (callsign,
 * scheduledDate, origin, destination, eta, etd, crewCount).  OPERATIONAL
 * fields (state, paxCount, parking, paxState, bagsState, fuel/toilet states)
 * are set only on CREATE so handler edits are never overwritten.
 *
 * Returns `{ record, wasCreated }` so callers can log correctly (BUG-6 fix).
 */
export async function upsertMovement(args: {
  visitId: string;
  direction: "ARRIVAL" | "DEPARTURE";
  callsign: string;
  scheduledDate: Date | string;
  data?: Record<string, unknown>;
}): Promise<{ record: Awaited<ReturnType<typeof prisma.movement.upsert>>; wasCreated: boolean }> {
  const scheduledDate =
    args.scheduledDate instanceof Date ? args.scheduledDate : palmaDayUtc(args.scheduledDate);

  // Split data into plan fields (safe to update) and operational fields (create-only).
  const allData = args.data || {};
  const planData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(allData)) {
    if (!MOVEMENT_OPERATIONAL_FIELDS.has(key)) {
      planData[key] = value;
    }
  }

  // To know if this is a create or update we need to check existence first.
  // prisma.movement.upsert doesn't tell us which path it took, so we track it.
  const existing = await prisma.movement.findUnique({
    where: { visitId_direction: { visitId: args.visitId, direction: args.direction } },
    select: { id: true },
  });

  const record = await prisma.movement.upsert({
    where: { visitId_direction: { visitId: args.visitId, direction: args.direction } },
    create: {
      visitId: args.visitId,
      direction: args.direction,
      callsign: args.callsign,
      scheduledDate,
      ...allData, // create includes everything (operational defaults from PDF)
    },
    update: {
      callsign: args.callsign,
      scheduledDate,
      ...planData, // update only touches plan fields
    },
  });

  return { record, wasCreated: !existing };
}
