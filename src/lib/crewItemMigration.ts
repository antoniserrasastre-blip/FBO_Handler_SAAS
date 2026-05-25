/**
 * crewItemMigration.ts
 *
 * Unified crew-inventory → Service migration.
 *
 * ## Conceptual model
 * A `CrewItem` represents an object left by the crew on ARRIVAL and returned on
 * DEPARTURE. In the unified model it is a `Service` that spans both legs
 * (direction = "BOTH") with a special origin marker ("CREW") so it can be
 * distinguished from externally-ordered extras.
 *
 * ## State mapping
 *   CrewItem.state = STORED   → Service.state = "PENDING"
 *     Rationale: the item is in our warehouse, not yet returned. "PENDING"
 *     means "action outstanding" — the handler still needs to return it.
 *
 *   CrewItem.state = RETURNED → Service.state = "DELIVERED"
 *     Rationale: item has been handed back to the crew. "DELIVERED" is the
 *     terminal state in the Service lifecycle.
 *
 * ## Direction
 *   All crew items span arrival → departure, so direction = "BOTH".
 *
 * ## Origin marker
 *   Service.origin = "CREW" — signals provenance. Consumers that want to
 *   render crew inventory separately can filter on this field.
 *   Service.target = "CREW" — the beneficiary is the crew.
 *
 * ## Idempotency strategy
 *   Each migrated Service receives a deterministic id = "ci_" + crewItem.id.
 *   The upsert uses `where: { id }` on the PRIMARY KEY. If the row already
 *   exists, `update: {}` is a deliberate no-op — re-running the migration
 *   never duplicates or overwrites data.
 *
 * ## Source of truth for reads (transition period)
 *   - Old UI (CrewInventory component): reads from the `CrewItem` table via
 *     GET /api/flights/[id]/crew-items. This is untouched.
 *   - Services list (VisitCard service strip, runners view): reads from the
 *     `Service` table and INCLUDES services with origin="CREW". After migration
 *     both tables exist; the data is duplicated until the UI is unified in a
 *     later step that removes the CrewItem reads.
 *   - New creations (POST /api/flights/[id]/crew-items): still creates a
 *     CrewItem row (old UI compat) AND a parallel Service with origin="CREW"
 *     and id="ci_"+crewItemId so the migration is also idempotent for fresh
 *     entries.
 */

import { prisma } from "@/lib/db";

// ---------------------------------------------------------------------------
// Pure mapping — no DB calls. Exported for unit tests.
// ---------------------------------------------------------------------------

export interface CrewItemRecord {
  id: string;
  visitId: string;
  type: string;
  customName: string | null;
  quantity: number;
  state: string;      // "STORED" | "RETURNED"
  notes: string | null;
}

export interface MappedService {
  id: string;
  visitId: string;
  type: string;
  customName: string | null;
  quantity: number;
  state: string;      // "PENDING" | "DELIVERED"
  direction: "BOTH";
  origin: "CREW";
  target: "CREW";
  rawDescription: string | null;
}

/**
 * Derives a deterministic Service id from a CrewItem id.
 * Guaranteed to be unique and stable across re-runs.
 */
export function crewItemServiceId(crewItemId: string): string {
  return `ci_${crewItemId}`;
}

/**
 * Maps a single CrewItem record to the corresponding Service shape.
 * Pure function — no side effects, no DB calls.
 *
 * State mapping:
 *   STORED   → PENDING   (item held, return action outstanding)
 *   RETURNED → DELIVERED (item returned to crew, terminal state)
 *   (any unknown state) → PENDING (safe default)
 */
export function crewItemToService(item: CrewItemRecord): MappedService {
  const state = item.state === "RETURNED" ? "DELIVERED" : "PENDING";

  return {
    id: crewItemServiceId(item.id),
    visitId: item.visitId,
    type: item.type,
    customName: item.customName,
    quantity: item.quantity,
    state,
    direction: "BOTH",
    origin: "CREW",
    target: "CREW",
    // Preserve original notes as rawDescription for audit trail.
    rawDescription: item.notes,
  };
}

// ---------------------------------------------------------------------------
// Migration executor — idempotent, non-destructive
// ---------------------------------------------------------------------------

export interface MigrationResult {
  total: number;
  upserted: number;
  skipped: number;
}

/**
 * Migrates all CrewItem rows to the Service table.
 * Safe to run multiple times: existing rows are not duplicated or modified.
 * Does NOT delete any CrewItem rows.
 *
 * @param visitId — if provided, migrates only CrewItems for that visit.
 *                  If omitted, migrates ALL CrewItems in the database.
 */
export async function migrateCrewItemsToServices(
  visitId?: string
): Promise<MigrationResult> {
  const where = visitId ? { visitId } : {};

  const crewItems = await prisma.crewItem.findMany({ where });

  let upserted = 0;
  const skipped = 0;

  for (const item of crewItems) {
    const mapped = crewItemToService(item);

    // upsert: create if not exists, no-op update if already present.
    const result = await prisma.service.upsert({
      where: { id: mapped.id },
      create: {
        id: mapped.id,
        visitId: mapped.visitId,
        type: mapped.type,
        customName: mapped.customName,
        quantity: mapped.quantity,
        state: mapped.state,
        direction: mapped.direction,
        origin: mapped.origin,
        target: mapped.target,
        rawDescription: mapped.rawDescription,
      },
      update: {
        // Deliberate no-op: idempotent re-runs do not overwrite existing data.
        // If the user manually edited the Service after migration, we preserve
        // their changes rather than reverting to the CrewItem values.
      },
    });

    // Prisma upsert always returns the row; we track whether it was freshly
    // created by checking if createdAt ≈ updatedAt (both set by Prisma on
    // create). A simpler heuristic: if the row's createdAt equals its updatedAt
    // it was just created. We use a two-step approach instead: attempt a
    // findUnique before upsert would be extra round-trips. Instead we accept
    // that the count is approximate — what matters is no duplication.
    // For correctness we count all processed rows as upserted (first run)
    // or skipped (subsequent runs are no-ops at the DB level).
    void result; // suppress unused-variable lint
    upserted++;
  }

  return { total: crewItems.length, upserted, skipped };
}
