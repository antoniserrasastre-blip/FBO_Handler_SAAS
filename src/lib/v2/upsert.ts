// Idempotent upsert helpers for the v2 domain. Keep them small and side-effect
// free except for the Prisma writes — callers compose them.

import { prisma } from "@/lib/db";
import { findOperator } from "@/lib/operators";
import { palmaDayUtc } from "@/lib/time";

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
    // Backfill aircraftType if it was missing
    if (!existing.aircraftType && args.aircraftType) {
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
 * Find or create a Visit for an aircraft on a given Palma operating day.
 *
 * `legCallsign` discriminates between multiple visits of the same aircraft
 * on the same day (e.g. two turnarounds back-to-back). The match cascade is:
 *
 *   1. Visit whose Movements include the callsign — same operational leg.
 *   2. Orphan Visit (no Movements yet) — typically an EXTRAS-only Visit
 *      created from the Excel before the PDF arrived. We adopt it so the
 *      attached services stay linked to the now-confirmed PDF Visit.
 *   3. Nothing found → create a brand-new Visit. This is the path that
 *      makes two same-day visits coexist instead of collapsing.
 *
 * Without `legCallsign`, falls back to legacy first-match-or-create.
 */
export async function upsertVisit(args: {
  aircraftId: string;
  palmaDay: Date | string;
  operatorId?: string | null;
  // Provenance — preserved on update unless explicitly upgraded (MANUAL → PDF
  // when a manual entry is later confirmed by a PDF re-import).
  source?: "PDF" | "MANUAL" | "EXTRAS";
  legCallsign?: string;
}) {
  const palmaDay = args.palmaDay instanceof Date ? args.palmaDay : palmaDayUtc(args.palmaDay);
  const cs = args.legCallsign?.toUpperCase().trim();

  let existing: Awaited<ReturnType<typeof prisma.visit.findFirst>> = null;

  if (cs) {
    existing = await prisma.visit.findFirst({
      where: {
        aircraftId: args.aircraftId,
        palmaDay,
        movements: { some: { callsign: cs } },
      },
    });
    if (!existing) {
      // Adopt an orphan Visit (no Movements yet) — keeps services attached.
      existing = await prisma.visit.findFirst({
        where: {
          aircraftId: args.aircraftId,
          palmaDay,
          movements: { none: {} },
        },
      });
    }
  } else {
    existing = await prisma.visit.findFirst({
      where: { aircraftId: args.aircraftId, palmaDay },
    });
  }

  if (existing) {
    const patch: Record<string, unknown> = {};
    if (!existing.operatorId && args.operatorId) patch.operatorId = args.operatorId;
    // Upgrade-only: MANUAL/EXTRAS → PDF when a PDF later vouches for the visit.
    // Never downgrade (PDF is the strongest provenance and protects from sync).
    if (args.source === "PDF" && existing.source !== "PDF") patch.source = "PDF";
    if (Object.keys(patch).length) {
      return prisma.visit.update({ where: { id: existing.id }, data: patch });
    }
    return existing;
  }
  return prisma.visit.create({
    data: {
      aircraftId: args.aircraftId,
      operatorId: args.operatorId || null,
      palmaDay,
      source: args.source || "MANUAL",
    },
  });
}

/**
 * Find or create a Movement (ARRIVAL or DEPARTURE) attached to a Visit.
 * Idempotent on (visitId, direction) — the unique constraint enforces 1+1 max.
 */
export async function upsertMovement(args: {
  visitId: string;
  direction: "ARRIVAL" | "DEPARTURE";
  callsign: string;
  scheduledDate: Date | string;
  data?: Record<string, unknown>;
}) {
  const scheduledDate =
    args.scheduledDate instanceof Date ? args.scheduledDate : palmaDayUtc(args.scheduledDate);
  return prisma.movement.upsert({
    where: { visitId_direction: { visitId: args.visitId, direction: args.direction } },
    create: {
      visitId: args.visitId,
      direction: args.direction,
      callsign: args.callsign,
      scheduledDate,
      ...(args.data || {}),
    },
    update: {
      callsign: args.callsign,
      scheduledDate,
      ...(args.data || {}),
    },
  });
}
