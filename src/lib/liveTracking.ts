// Live ADS-B tracking via OpenSky.
//
// pollOnce() is the entrypoint driven by liveTrackingWorker.ts. It loads the
// active Movements (visits in [ayer, hoy, mañana], state ≠ OFF_BLOCKS), pulls
// the current state vectors from OpenSky around LEPA, matches them to
// Movements (by cached icao24 → callsign → registration), and upserts the
// live snapshot on each match.
//
// On phase transitions we also seed Movement.ata / Movement.atd if still
// empty, and emit an EventLog row so the audit trail shows which transitions
// came from ADS-B vs. a handler override.

import { prisma } from "./db";
import { fetchStates, type OpenSkyState } from "./opensky";
import { palmaDayUtc } from "./time";

export type LivePhase = "APPROACHING" | "LANDED" | "ON_BLOCKS" | "DEPARTED";

const VELOCITY_TAXI_THRESHOLD_MS = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

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

// §S4 C13 — guardia de plausibilidad del seeding de ata/atd desde el feed
// (contrato: src/lib/mcp/contract.ts §S4). Pura y exportada para tests.
// El seeding entero queda tras el kill-switch process.env.LIVE_SEED_TIMES
// === "true" (default APAGADO). Stub del orquestador: implementer al verde.
export function canSeedTime(args: {
  direction: "ARRIVAL" | "DEPARTURE";
  scheduledDate: Date;
  todayPalmaDay: Date;
  prevLivePhase: string | null;
  newPhase: LivePhase;
  existingValue: string | null;
}): boolean {
  // Jamás pisar un valor ya escrito (mano del handler o poll previo).
  if (args.existingValue) return false;
  // Solo piernas cuyo día civil == hoy (mata matcheos por matrícula de otro día).
  if (args.scheduledDate.getTime() !== args.todayPalmaDay.getTime()) return false;
  if (args.direction === "ARRIVAL") {
    // ata solo si la transición viene DESDE el aire (jamás visto ya parado).
    return args.prevLivePhase === "APPROACHING" || args.prevLivePhase === "LANDED";
  }
  // atd solo si el avión estaba EN TIERRA antes (un crucero jamás siembra atd).
  return args.prevLivePhase === "LANDED" || args.prevLivePhase === "ON_BLOCKS";
}

function toZuluHHMM(d: Date): string {
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export async function pollOnce(): Promise<{ fetched: number; matched: number; transitions: number }> {
  // Window: palmaDay ∈ [ayer, hoy, mañana]. We look forward so an approaching
  // flight that crosses midnight gets matched before it lands.
  const today = palmaDayUtc();
  const yesterday = new Date(today.getTime() - DAY_MS);
  const tomorrow = new Date(today.getTime() + DAY_MS);

  const movements = await prisma.movement.findMany({
    where: {
      state: { not: "OFF_BLOCKS" },
      visit: { palmaDay: { in: [yesterday, today, tomorrow] } },
    },
    include: { visit: { include: { aircraft: true } } },
  });

  if (movements.length === 0) return { fetched: 0, matched: 0, transitions: 0 };

  const states = await fetchStates();

  // Build two indexes: by icao24 (cached from prior polls, cheap to hit) and
  // by normalised callsign (fallback + first-time match).
  const stateByIcao = new Map<string, OpenSkyState>();
  for (const s of states) stateByIcao.set(s.icao24, s);
  const stateByCallsign = indexByCallsign(states);

  let matched = 0;
  let transitions = 0;

  for (const m of movements) {
    let state: OpenSkyState | undefined;

    if (m.liveIcao24) state = stateByIcao.get(m.liveIcao24);
    if (!state) state = stateByCallsign.get(normaliseCallsign(m.callsign));
    if (!state) state = stateByCallsign.get(normaliseCallsign(m.visit.aircraft.registration));
    if (!state) continue;

    matched++;

    const phase = computePhase(state);
    const phaseChanged = m.livePhase !== phase;
    const seenAt = new Date(state.lastContact * 1000);

    // Build the patch incrementally so we don't overwrite ata/atd that a
    // handler typed in manually.
    const data: Record<string, unknown> = {
      liveIcao24: state.icao24,
      livePhase: phase,
      liveLastSeenAt: seenAt,
      liveOnGround: state.onGround,
      liveAltitudeM: state.baroAltitudeM,
      liveVelocityMs: state.velocityMs,
    };

    // §S4 C13 — kill-switch: el seeding de ata/atd desde el feed SOLO si
    // LIVE_SEED_TIMES === "true" (default APAGADO, gate 23-07). El snapshot
    // live* y el EventLog de transición fluyen SIEMPRE (abajo), en ambos modos.
    if (phaseChanged && process.env.LIVE_SEED_TIMES === "true") {
      if (
        phase === "ON_BLOCKS" &&
        m.direction === "ARRIVAL" &&
        canSeedTime({
          direction: "ARRIVAL",
          scheduledDate: m.scheduledDate,
          todayPalmaDay: today,
          prevLivePhase: m.livePhase,
          newPhase: phase,
          existingValue: m.ata,
        })
      ) {
        data.ata = toZuluHHMM(seenAt);
      }
      if (
        phase === "DEPARTED" &&
        m.direction === "DEPARTURE" &&
        canSeedTime({
          direction: "DEPARTURE",
          scheduledDate: m.scheduledDate,
          todayPalmaDay: today,
          prevLivePhase: m.livePhase,
          newPhase: phase,
          existingValue: m.atd,
        })
      ) {
        data.atd = toZuluHHMM(seenAt);
      }
    }

    await prisma.movement.update({ where: { id: m.id }, data });

    if (phaseChanged) {
      transitions++;
      await prisma.eventLog.create({
        data: {
          movementId: m.id,
          visitId: m.visitId,
          action: `live → ${phase}`,
          details: JSON.stringify({
            icao24: state.icao24,
            callsign: state.callsign,
            onGround: state.onGround,
            altitudeM: state.baroAltitudeM,
            velocityMs: state.velocityMs,
          }),
        },
      });
    }
  }

  return { fetched: states.length, matched, transitions };
}

// Compat shim — pre-v2 callers imported this name. New code uses pollOnce().
export async function ingestLiveStates(): Promise<{ matched: number }> {
  const result = await pollOnce();
  return { matched: result.matched };
}
