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
const MOVEMENT_OPERATIONAL_FIELDS = new Set([
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
 * Find or create a Visit for a given aircraft on a given Palma operating day.
 * Multiple legs in the same day end up as separate Visits — callers should
 * key by callsign+date if disambiguation is needed (current import flows
 * treat one aircraft/day as one visit, mirroring the old Flight semantics).
 *
 * Returns `{ record, wasCreated }` so callers can distinguish first import
 * from re-import without relying on the timestamp heuristic (BUG-6 fix).
 */
export async function upsertVisit(args: {
  aircraftId: string;
  palmaDay: Date | string;
  operatorId?: string | null;
}): Promise<{ record: Awaited<ReturnType<typeof prisma.visit.create>>; wasCreated: boolean }> {
  const palmaDay = args.palmaDay instanceof Date ? args.palmaDay : palmaDayUtc(args.palmaDay);
  const existing = await prisma.visit.findFirst({
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
