import { prisma } from "./db";

/**
 * Migracion idempotente de los 6 estados antiguos a los 5 nuevos.
 * Mapeo:
 *   ON_BLOCKS  → ARRIVING
 *   TURNAROUND → DEPARTING
 *   BOARDING   → DEPARTING
 *   OFF_BLOCKS → DEPARTED
 *   ON_GROUND  → ARRIVING  (legado pre-2026)
 *   DISPATCHED → DEPARTED  (legado pre-2026)
 *
 * Idempotente: cada UPDATE solo afecta a rows que aun tienen el estado viejo,
 * asi que es seguro correrla en cada boot. Cuando ya este todo migrado las
 * UPDATE devuelven 0 rows afectadas.
 *
 * Tambien sigue funcionando aunque alguien hace fallback al normalizer en
 * runtime: el normalizer mapea estados viejos a nuevos al leerlos. Este job
 * solo limpia la DB para no acumular legacy.
 */
export async function migrateFlightStatesTo5(): Promise<{ updated: number }> {
  const migrations: Array<{ from: string; to: string }> = [
    { from: "ON_BLOCKS", to: "ARRIVING" },
    { from: "TURNAROUND", to: "DEPARTING" },
    { from: "BOARDING", to: "DEPARTING" },
    { from: "OFF_BLOCKS", to: "DEPARTED" },
    { from: "ON_GROUND", to: "ARRIVING" },
    { from: "DISPATCHED", to: "DEPARTED" },
  ];

  let total = 0;
  for (const m of migrations) {
    const r = await prisma.flight.updateMany({
      where: { state: m.from },
      data: { state: m.to },
    });
    if (r.count > 0) {
      console.log(`[stateMigration] ${r.count} flights ${m.from} → ${m.to}`);
      total += r.count;
    }
  }
  return { updated: total };
}
