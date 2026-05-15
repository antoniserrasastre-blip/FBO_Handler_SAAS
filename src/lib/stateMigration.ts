// v2: legacy state migration no longer applies — Movement.state is the source
// of truth and uses the canonical 6-state enum (EXPECTED → OFF_BLOCKS) from
// the schema. This function is kept as a no-op stub to preserve the import
// site in `vercel-setup.sh` / boot scripts without breaking them.

export async function migrateFlightStatesTo5(): Promise<{ updated: number }> {
  return { updated: 0 };
}
