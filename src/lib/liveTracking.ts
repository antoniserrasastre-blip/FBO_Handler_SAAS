import { prisma } from "./db";
import { eventBus } from "./events";
import { fetchStates, OpenSkyState } from "./opensky";

export type LivePhase = "APPROACHING" | "LANDED" | "ON_BLOCKS" | "DEPARTED";

const VELOCITY_TAXI_THRESHOLD_MS = 2; // <2 m/s ≈ stopped at stand

/** Normalise a callsign for matching: uppercase, alphanumeric only. */
export function normaliseCallsign(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Decide live phase from a single ADS-B observation. */
export function computePhase(s: OpenSkyState): LivePhase {
  if (s.onGround) {
    if (s.velocityMs !== null && s.velocityMs < VELOCITY_TAXI_THRESHOLD_MS) return "ON_BLOCKS";
    return "LANDED";
  }
  // Airborne — descending or low → approaching, otherwise departed/cruising
  if (s.verticalRateMs !== null && s.verticalRateMs < -1) return "APPROACHING";
  if (s.baroAltitudeM !== null && s.baroAltitudeM < 1500) return "APPROACHING";
  return "DEPARTED";
}

/** Pick the freshest state per callsign (OpenSky can return duplicates briefly). */
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

type FlightForMatch = {
  id: string;
  callsign: string;
  livePhase: string | null;
};

export type MatchResult = {
  flightId: string;
  state: OpenSkyState;
  phase: LivePhase;
  phaseChanged: boolean;
};

/** Match a set of Flights (today's schedule) against an OpenSky state snapshot. */
export function matchFlights(
  flights: FlightForMatch[],
  states: OpenSkyState[],
): MatchResult[] {
  const byCallsign = indexByCallsign(states);
  const results: MatchResult[] = [];
  for (const f of flights) {
    const key = normaliseCallsign(f.callsign);
    if (!key) continue;
    const state = byCallsign.get(key);
    if (!state) continue;
    const phase = computePhase(state);
    results.push({
      flightId: f.id,
      state,
      phase,
      phaseChanged: f.livePhase !== phase,
    });
  }
  return results;
}

/**
 * One poll cycle: fetch current ADS-B snapshot, match against the day's
 * flights, persist updates, emit SSE events on phase transitions.
 * Returns a small summary for the caller.
 */
export async function pollOnce(): Promise<{
  fetched: number;
  matched: number;
  transitions: number;
}> {
  const states = await fetchStates();

  // Match against all flights for "active" days (today + yesterday late + tomorrow
  // early, in case a callsign appears across midnight). Cheap query: SQLite, indexed.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const until = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const flights = await prisma.flight.findMany({
    where: {
      daySheet: { date: { gte: since, lte: until } },
    },
    select: { id: true, callsign: true, livePhase: true },
  });

  const matches = matchFlights(flights, states);

  let transitions = 0;
  for (const m of matches) {
    await prisma.flight.update({
      where: { id: m.flightId },
      data: {
        liveIcao24: m.state.icao24,
        liveLatitude: m.state.latitude,
        liveLongitude: m.state.longitude,
        liveAltitudeM: m.state.baroAltitudeM,
        liveVelocityMs: m.state.velocityMs,
        liveHeading: m.state.trueTrack,
        liveVerticalRateMs: m.state.verticalRateMs,
        liveOnGround: m.state.onGround,
        livePhase: m.phase,
        liveLastSeenAt: new Date(m.state.lastContact * 1000),
      },
    });
    if (m.phaseChanged) {
      transitions++;
      eventBus.emit({
        type: "flight_updated",
        flightId: m.flightId,
        detail: `live phase → ${m.phase}`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  return { fetched: states.length, matched: matches.length, transitions };
}
