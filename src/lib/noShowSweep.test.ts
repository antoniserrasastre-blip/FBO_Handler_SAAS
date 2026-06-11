// Tests del sweep de no-shows (B1).
//
// Contrato:
//  - solo ARRIVAL EXPECTED sin ata con scheduledDate < hoy-1 (los de ayer
//    siguen siendo válidos: vuelos retrasados de madrugada),
//  - evidencia de llegada (ata / livePhase LANDED|ON_BLOCKS) o categoría
//    CANCELLED ⇒ no se toca,
//  - cada transición deja EventLog con el código NO_SHOW y emite SSE.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const findManyMock = vi.fn();
const movementUpdateMock = vi.fn();
const eventLogCreateMock = vi.fn();
const emitMock = vi.fn();

const TODAY = new Date("2025-06-12T00:00:00.000Z");

function buildStaleArrival(overrides: Record<string, unknown> = {}) {
  return {
    id: "m-arr-old",
    visitId: "v-old",
    callsign: "MFWWW",
    ata: null,
    livePhase: null,
    flightCategory: "COMMERCIAL",
    scheduledDate: new Date("2025-06-07T00:00:00.000Z"),
    ...overrides,
  };
}

function mockDeps(rows: unknown[]) {
  findManyMock.mockReset().mockResolvedValue(rows);
  movementUpdateMock.mockReset().mockResolvedValue({});
  eventLogCreateMock.mockReset().mockResolvedValue({});
  emitMock.mockReset();

  vi.doMock("@/lib/db", () => ({
    prisma: {
      movement: { findMany: findManyMock, update: movementUpdateMock },
      eventLog: { create: eventLogCreateMock },
    },
  }));
  vi.doMock("@/lib/events", () => ({ eventBus: { emit: emitMock } }));
}

async function run() {
  const { sweepNoShows } = await import("./noShowSweep");
  return sweepNoShows({ userId: "u1", today: TODAY });
}

describe("sweepNoShows", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock("@/lib/db");
    vi.doUnmock("@/lib/events");
  });

  it("queries only ARRIVAL EXPECTED without ata older than today-1", async () => {
    mockDeps([]);
    await run();

    expect(findManyMock).toHaveBeenCalledTimes(1);
    const where = findManyMock.mock.calls[0][0].where;
    expect(where.direction).toBe("ARRIVAL");
    expect(where.state).toBe("EXPECTED");
    expect(where.ata).toBeNull();
    // cutoff = hoy-1 ⇒ un EXPECTED de ayer (lt excluye el 11-06) sobrevive
    expect(where.scheduledDate.lt.toISOString()).toBe("2025-06-11T00:00:00.000Z");
  });

  it("marks a stale EXPECTED arrival as NO_SHOW with EventLog (state code) and SSE emit", async () => {
    mockDeps([buildStaleArrival()]);

    const marked = await run();

    expect(marked).toBe(1);
    expect(movementUpdateMock).toHaveBeenCalledWith({
      where: { id: "m-arr-old" },
      data: { state: "NO_SHOW" },
    });

    const logData = eventLogCreateMock.mock.calls[0][0].data;
    expect(logData.action).toBe("Auto-transición → NO_SHOW");
    expect(logData.visitId).toBe("v-old");
    expect(logData.movementId).toBe("m-arr-old");
    expect(logData.userId).toBe("u1");

    // Regla de oro: cada cambio de estado relevante emite evento SSE.
    expect(emitMock).toHaveBeenCalledTimes(1);
    const emitted = emitMock.mock.calls[0][0];
    expect(emitted.type).toBe("flight_updated");
    expect(emitted.flightId).toBe("v-old");
  });

  it("skips arrivals with live-tracking evidence (LANDED / ON_BLOCKS)", async () => {
    mockDeps([
      buildStaleArrival({ id: "m-1", livePhase: "LANDED" }),
      buildStaleArrival({ id: "m-2", livePhase: "ON_BLOCKS" }),
    ]);

    const marked = await run();

    expect(marked).toBe(0);
    expect(movementUpdateMock).not.toHaveBeenCalled();
    expect(emitMock).not.toHaveBeenCalled();
  });

  it("skips CANCELLED movements (already terminal)", async () => {
    mockDeps([buildStaleArrival({ flightCategory: "CANCELLED" })]);

    const marked = await run();

    expect(marked).toBe(0);
    expect(movementUpdateMock).not.toHaveBeenCalled();
  });

  it("processes mixed batches and returns the marked count", async () => {
    mockDeps([
      buildStaleArrival({ id: "m-a", visitId: "v-a" }),
      buildStaleArrival({ id: "m-b", visitId: "v-b", livePhase: "LANDED" }),
      buildStaleArrival({ id: "m-c", visitId: "v-c" }),
    ]);

    const marked = await run();

    expect(marked).toBe(2);
    expect(movementUpdateMock).toHaveBeenCalledTimes(2);
    expect(eventLogCreateMock).toHaveBeenCalledTimes(2);
    expect(emitMock).toHaveBeenCalledTimes(2);
    const updatedIds = movementUpdateMock.mock.calls.map((c) => c[0].where.id);
    expect(updatedIds).toEqual(["m-a", "m-c"]);
  });
});
