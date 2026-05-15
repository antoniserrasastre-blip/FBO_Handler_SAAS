// Live ADS-B tracking via OpenSky.
//
// v2 stub: the live tracking columns (liveLatitude, liveLongitude, livePhase…)
// were attached to the deprecated Flight model and have not been ported to
// the v2 Movement schema yet. The pure helpers (`computePhase`,
// `indexByCallsign`, `normaliseCallsign`) remain because they are framework-
// independent and used by tests. DB-touching paths are TODOs.

import type { OpenSkyState } from "./opensky";

export type LivePhase = "APPROACHING" | "LANDED" | "ON_BLOCKS" | "DEPARTED";

const VELOCITY_TAXI_THRESHOLD_MS = 2;

export function normaliseCallsign(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function computePhase(s: OpenSkyState): LivePhase {
  if (s.onGround) {
    if (s.velocityMs !== null && s.velocityMs < VELOCITY_TAXI_THRESHOLD_MS) return "ON_BLOCKS";
    return "LANDED";
  }
  if (s.verticalRateMs !== null && s.verticalRateMs < -1) return "APPROACHING";
  if (s.baroAltitudeM !== null && s.baroAltitudeM < 1500) return "APPROACHING";
  return "DEPARTED";
}

export function indexByCallsign(states: OpenSkyState[]): Map<string, OpenSkyState> {
  const out = new Map<string, OpenSkyState>();
  for (const s of states) {
    const key = normaliseCallsign(s.callsign);
    if (!key) continue;
    const prev = out.get(key);
    if (!prev || s.lastContact > prev.lastContact) out.set(key, s);
  }
  return out;
}

// TODO(v2): re-implement DB ingestion of OpenSky states against Movement.
// Decide whether the live columns live directly on Movement or in a
// LiveSnapshot side-table. Until then, the cron / live route below are no-ops.
export async function ingestLiveStates(): Promise<{ matched: number }> {
  return { matched: 0 };
}

// Stubs preserved so existing imports compile. They return empty results
// instead of querying the deprecated Flight table.

interface FlightForMatchStub {
  id: string;
  callsign: string;
  registration: string;
  livePhase: string | null;
  liveOnGround: boolean | null;
}

export interface FlightMatchResult {
  flightId: string;
  phase: LivePhase;
  phaseChanged: boolean;
  state: OpenSkyState;
}

// Pure matcher kept for unit tests. Pairs an ADS-B state with a flight by
// callsign (preferred) or registration (fallback for private bizjets).
export function matchFlights(flights: FlightForMatchStub[], states: OpenSkyState[]): FlightMatchResult[] {
  const stateByKey = indexByCallsign(states);
  const results: FlightMatchResult[] = [];
  for (const f of flights) {
    const callsignKey = normaliseCallsign(f.callsign);
    const regKey = normaliseCallsign(f.registration);
    const state = stateByKey.get(callsignKey) || stateByKey.get(regKey);
    if (!state) continue;
    const phase = computePhase(state);
    const phaseChanged = f.livePhase !== phase;
    results.push({ flightId: f.id, phase, phaseChanged, state });
  }
  return results;
}

export async function pollOnce(): Promise<{ fetched: number; matched: number; transitions: number }> {
  return { fetched: 0, matched: 0, transitions: 0 };
}
