// Next.js instrumentation hook — runs once when the server boots.
// Used to start the OpenSky live-tracking poller.
// https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
//
// IMPORTANT: with the `src/` folder layout this file MUST live at
// `src/instrumentation.ts`, NOT at the project root. Next.js silently ignores
// the root location when `src/app` is used.

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log("[instrumentation] register() called, starting live tracking worker");
    const { startLiveTrackingWorker } = await import("@/lib/liveTrackingWorker");
    startLiveTrackingWorker();
  }
}
