// Next.js instrumentation hook — runs once when the server boots.
// We use it to start the OpenSky live-tracking poller.
// https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startLiveTrackingWorker } = await import("./src/lib/liveTrackingWorker");
    startLiveTrackingWorker();
  }
}
