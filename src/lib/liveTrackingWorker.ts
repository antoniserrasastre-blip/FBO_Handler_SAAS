// Singleton background poller. Started once from instrumentation.ts at server
// boot. Disabled when OPENSKY_DISABLED=true (e.g. local dev without internet).
//
// In a single-container deploy (see ADR 0001) one Node process owns the
// interval. For multi-instance we'd move this to an external scheduler.

import { pollOnce } from "./liveTracking";

const POLL_INTERVAL_MS = 35_000;

type WorkerState = {
  timer: NodeJS.Timeout | null;
  running: boolean;
  lastRunAt: number | null;
  lastError: string | null;
  lastSummary: { fetched: number; matched: number; transitions: number } | null;
};

const globalForWorker = globalThis as unknown as {
  __liveTrackingWorker?: WorkerState;
};

function getState(): WorkerState {
  if (!globalForWorker.__liveTrackingWorker) {
    globalForWorker.__liveTrackingWorker = {
      timer: null,
      running: false,
      lastRunAt: null,
      lastError: null,
      lastSummary: null,
    };
  }
  return globalForWorker.__liveTrackingWorker;
}

async function tick() {
  const state = getState();
  if (state.running) return; // skip overlapping runs
  state.running = true;
  try {
    state.lastSummary = await pollOnce();
    state.lastError = null;
  } catch (err) {
    state.lastError = err instanceof Error ? err.message : String(err);
    console.error("[liveTracking] poll failed:", state.lastError);
  } finally {
    state.lastRunAt = Date.now();
    state.running = false;
  }
}

export function startLiveTrackingWorker() {
  if (process.env.OPENSKY_DISABLED === "true") {
    console.log("[liveTracking] disabled via OPENSKY_DISABLED");
    return;
  }
  const state = getState();
  if (state.timer) return; // already running
  // Run once at boot, then on interval.
  void tick();
  state.timer = setInterval(tick, POLL_INTERVAL_MS);
  console.log(`[liveTracking] worker started, polling every ${POLL_INTERVAL_MS}ms`);
}

export function getWorkerStatus() {
  const state = getState();
  return {
    enabled: process.env.OPENSKY_DISABLED !== "true",
    running: state.running,
    lastRunAt: state.lastRunAt,
    lastError: state.lastError,
    lastSummary: state.lastSummary,
  };
}
