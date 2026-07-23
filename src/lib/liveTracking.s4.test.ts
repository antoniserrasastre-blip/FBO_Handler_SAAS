// Sprint 04 board-del-turno — fase ROJA. TEST-WRITER.
// T8 — feed live (C13): kill-switch OFF por defecto + guardia de plausibilidad
// canSeedTime. Contrato pineado: src/lib/mcp/contract.ts §S4 C13.
//
// - canSeedTime (pura, exportada): se prueba directa contra el stub
//   (NotImplemented). Esa ES la razón de rojo.
// - pollOnce: con kill-switch OFF (default) JAMÁS escribe ata/atd bajo ninguna
//   secuencia; el snapshot live* y el EventLog fluyen igual. Con ON, la guardia
//   canSeedTime decide (jamás siembra en pierna de otro día).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { OpenSkyState } from "./opensky";

const mocks = vi.hoisted(() => ({
  movementFindMany: vi.fn(),
  movementUpdate: vi.fn(),
  eventLogCreate: vi.fn(),
  fetchStates: vi.fn(),
}));

vi.mock("./db", () => ({
  prisma: {
    movement: { findMany: mocks.movementFindMany, update: mocks.movementUpdate },
    eventLog: { create: mocks.eventLogCreate },
  },
}));
vi.mock("./opensky", () => ({ fetchStates: mocks.fetchStates }));

import { canSeedTime, pollOnce } from "./liveTracking";
import { palmaDayUtc } from "./time";

const DAY_MS = 24 * 60 * 60 * 1000;

function mkState(partial: Partial<OpenSkyState>): OpenSkyState {
  return {
    icao24: "abc123",
    callsign: "NJE1CK",
    originCountry: "Spain",
    timePosition: 0,
    lastContact: Math.floor(Date.parse("2026-07-23T10:00:00Z") / 1000),
    longitude: 2.7,
    latitude: 39.5,
    baroAltitudeM: 1000,
    onGround: false,
    velocityMs: 100,
    trueTrack: 90,
    verticalRateMs: 0,
    geoAltitudeM: 1000,
    squawk: null,
    spi: false,
    positionSource: 0,
    ...partial,
  };
}

function movRow(over: Record<string, unknown> = {}) {
  return {
    id: "m-1",
    visitId: "v-1",
    direction: "DEPARTURE",
    callsign: "NJE1CK",
    scheduledDate: palmaDayUtc(),
    state: "EXPECTED",
    ata: null,
    atd: null,
    livePhase: null,
    liveIcao24: null,
    visit: { aircraft: { registration: "CS-XXX" } },
    ...over,
  };
}

let ORIG_ENV: string | undefined;
beforeEach(() => {
  vi.clearAllMocks();
  ORIG_ENV = process.env.LIVE_SEED_TIMES;
  delete process.env.LIVE_SEED_TIMES; // default: APAGADO
  mocks.movementUpdate.mockResolvedValue({});
  mocks.eventLogCreate.mockResolvedValue({ id: "el" });
});
afterEach(() => {
  if (ORIG_ENV === undefined) delete process.env.LIVE_SEED_TIMES;
  else process.env.LIVE_SEED_TIMES = ORIG_ENV;
});

// ===========================================================================
// canSeedTime — guardia pura (vigente cuando se reactive el seeding).
// ===========================================================================
describe("canSeedTime — guardia de plausibilidad (T8/C13)", () => {
  const today = palmaDayUtc();
  const other = new Date(today.getTime() - DAY_MS);

  // --- atd (DEPARTURE) ---
  it("atd: DEPARTURE de HOY, prevPhase EN TIERRA (ON_BLOCKS), sin valor previo → true", () => {
    expect(
      canSeedTime({ direction: "DEPARTURE", scheduledDate: today, todayPalmaDay: today, prevLivePhase: "ON_BLOCKS", newPhase: "DEPARTED", existingValue: null })
    ).toBe(true);
  });

  it("atd: avión en CRUCERO (prevPhase null, nunca visto en tierra) → false (mata el DEPARTED fantasma)", () => {
    expect(
      canSeedTime({ direction: "DEPARTURE", scheduledDate: today, todayPalmaDay: today, prevLivePhase: null, newPhase: "DEPARTED", existingValue: null })
    ).toBe(false);
  });

  it("atd: pierna de OTRO día → false (mata el matcheo por matrícula de otro día)", () => {
    expect(
      canSeedTime({ direction: "DEPARTURE", scheduledDate: other, todayPalmaDay: today, prevLivePhase: "ON_BLOCKS", newPhase: "DEPARTED", existingValue: null })
    ).toBe(false);
  });

  it("atd: JAMÁS pisa un valor existente", () => {
    expect(
      canSeedTime({ direction: "DEPARTURE", scheduledDate: today, todayPalmaDay: today, prevLivePhase: "ON_BLOCKS", newPhase: "DEPARTED", existingValue: "10:00" })
    ).toBe(false);
  });

  // --- ata (ARRIVAL) ---
  it("ata: ARRIVAL de HOY con transición DESDE aire (prevPhase APPROACHING), sin valor previo → true", () => {
    expect(
      canSeedTime({ direction: "ARRIVAL", scheduledDate: today, todayPalmaDay: today, prevLivePhase: "APPROACHING", newPhase: "ON_BLOCKS", existingValue: null })
    ).toBe(true);
  });

  it("ata: avión visto por primera vez YA PARADO (prevPhase null) → false", () => {
    expect(
      canSeedTime({ direction: "ARRIVAL", scheduledDate: today, todayPalmaDay: today, prevLivePhase: null, newPhase: "ON_BLOCKS", existingValue: null })
    ).toBe(false);
  });

  it("ata: pierna de OTRO día → false", () => {
    expect(
      canSeedTime({ direction: "ARRIVAL", scheduledDate: other, todayPalmaDay: today, prevLivePhase: "APPROACHING", newPhase: "ON_BLOCKS", existingValue: null })
    ).toBe(false);
  });

  it("ata: JAMÁS pisa un valor existente", () => {
    expect(
      canSeedTime({ direction: "ARRIVAL", scheduledDate: today, todayPalmaDay: today, prevLivePhase: "APPROACHING", newPhase: "ON_BLOCKS", existingValue: "07:30" })
    ).toBe(false);
  });
});

// ===========================================================================
// pollOnce — kill-switch OFF (default): jamás ata/atd; snapshot + EventLog sí.
// ===========================================================================
describe("pollOnce — kill-switch OFF por defecto (T8/C13)", () => {
  it("DEPARTURE que despega: NO escribe atd (default), pero SÍ el snapshot live* y el EventLog", async () => {
    mocks.movementFindMany.mockResolvedValue([movRow({ direction: "DEPARTURE" })]);
    mocks.fetchStates.mockResolvedValue([mkState({ onGround: false, verticalRateMs: 5, baroAltitudeM: 10000 })]); // DEPARTED

    await pollOnce();

    expect(mocks.movementUpdate).toHaveBeenCalledTimes(1);
    const data = (mocks.movementUpdate.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data).not.toHaveProperty("atd"); // kill-switch OFF
    expect(data).not.toHaveProperty("ata");
    // el snapshot live* sí fluye.
    expect(data.livePhase).toBe("DEPARTED");
    expect(data.liveIcao24).toBeDefined();
    // y el EventLog de transición también.
    expect(mocks.eventLogCreate).toHaveBeenCalledTimes(1);
    expect((mocks.eventLogCreate.mock.calls[0][0] as { data: { action: string } }).data.action).toContain("live");
  });

  it("ARRIVAL que aterriza y para: NO escribe ata (default), pero SÍ snapshot + EventLog", async () => {
    mocks.movementFindMany.mockResolvedValue([movRow({ id: "m-arr", direction: "ARRIVAL", ata: null })]);
    mocks.fetchStates.mockResolvedValue([mkState({ onGround: true, velocityMs: 0 })]); // ON_BLOCKS

    await pollOnce();

    const data = (mocks.movementUpdate.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data).not.toHaveProperty("ata");
    expect(data.livePhase).toBe("ON_BLOCKS");
    expect(mocks.eventLogCreate).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// pollOnce — kill-switch ON: la guardia canSeedTime decide (no siembra en
// pierna de otro día).
// ===========================================================================
describe("pollOnce — kill-switch ON consulta la guardia (T8/C13)", () => {
  it("con LIVE_SEED_TIMES=true, una DEPARTURE de OTRO día NO recibe atd (guardia)", async () => {
    process.env.LIVE_SEED_TIMES = "true";
    const yesterday = new Date(palmaDayUtc().getTime() - DAY_MS);
    mocks.movementFindMany.mockResolvedValue([
      movRow({ direction: "DEPARTURE", scheduledDate: yesterday, livePhase: null }),
    ]);
    mocks.fetchStates.mockResolvedValue([mkState({ onGround: false, verticalRateMs: 5, baroAltitudeM: 10000 })]); // DEPARTED

    await pollOnce();

    const data = (mocks.movementUpdate.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data).not.toHaveProperty("atd"); // la guardia lo bloquea (otro día + crucero)
  });
});
