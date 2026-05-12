// Next.js instrumentation hook — runs once when the server boots.
// Used to start the OpenSky live-tracking poller.
// https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
//
// IMPORTANT: with the `src/` folder layout this file MUST live at
// `src/instrumentation.ts`, NOT at the project root. Next.js silently ignores
// the root location when `src/app` is used.

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log("[instrumentation] register() called");

    // Una sola pasada idempotente para migrar estados 6→5 si quedan rows
    // viejos (ON_BLOCKS, TURNAROUND, BOARDING, OFF_BLOCKS).
    try {
      const { migrateFlightStatesTo5 } = await import("@/lib/stateMigration");
      const r = await migrateFlightStatesTo5();
      if (r.updated > 0) console.log(`[stateMigration] total ${r.updated} flights migrados a estados nuevos`);
    } catch (e) {
      console.error("[stateMigration] failed:", e instanceof Error ? e.message : e);
    }

    const { startLiveTrackingWorker } = await import("@/lib/liveTrackingWorker");
    startLiveTrackingWorker();
  }
}
