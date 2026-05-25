/**
 * POST /api/admin/migrate-crew-items
 *
 * One-shot (idempotent) migration endpoint: copies all CrewItem rows into the
 * Service table with origin="CREW" so that crew inventory appears in the
 * unified service list.
 *
 * Safe to call multiple times — re-runs are no-ops at the DB level (upsert
 * on deterministic id "ci_" + crewItemId, with empty update payload).
 *
 * Access: ADMIN only. Never call this from UI; run it once from the ops
 * dashboard or via curl after deploying the unified-inventory feature.
 *
 * Optional query param:
 *   ?visitId=<id>  — restrict migration to a single visit (useful for testing)
 *
 * Returns JSON:
 *   { ok: true, total, upserted }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/roles";
import { migrateCrewItemsToServices } from "@/lib/crewItemMigration";

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const visitId = req.nextUrl.searchParams.get("visitId") ?? undefined;

  const result = await migrateCrewItemsToServices(visitId);

  return NextResponse.json({ ok: true, ...result });
}
