// Tests del helper compartido de auto-transición (deuda D2).
//
// Contrato unificado (antes divergía entre /api/flights/[id] y
// /api/services/[id]):
//  - persiste el estado en el Movement primario (DEPARTURE > ARRIVAL),
//  - EventLog con movementId y el CÓDIGO de estado en action
//    ("Auto-transición → ON_BLOCKS", nunca el label de UI),
//  - emite flight_updated con el label español en detail.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const movementUpdateMock = vi.fn();
const eventLogCreateMock = vi.fn();
const emitMock = vi.fn();
const suggestNextStateMock = vi.fn();

function buildVisit(overrides: Record<string, unknown> = {}) {
  return {
    id: "v1",
    aircraftId: "ac1",
    operatorId: null,
    palmaDay: new Date("2025-06-12T00:00:00.000Z"),
    type: "TURNAROUND",
    arrivalDate: new Date("2025-06-12T00:00:00.000Z"),
    departureDate: new Date("2025-06-12T00:00:00.000Z"),
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    aircraft: { registration: "CS-DXX", aircraftType: "GLEX" },
    movements: [
      {
        id: "m-arr",
        direction: "ARRIVAL",
        callsign: "NJE001",
        eta: "08:30",
        state: "EXPECTED",
        scheduledDate: new Date("2025-06-12T00:00:00.000Z"),
      },
      {
        id: "m-dep",
        direction: "DEPARTURE",
        callsign: "NJE001",
        etd: "11:00",
        state: "EXPECTED",
        scheduledDate: new Date("2025-06-12T00:00:00.000Z"),
      },
    ],
    services: [],
    ...overrides,
  };
}

function mockDeps(visit: unknown) {
  movementUpdateMock.mockReset().mockResolvedValue({});
  eventLogCreateMock.mockReset().mockResolvedValue({});
  emitMock.mockReset();
  suggestNextStateMock.mockReset();

  vi.doMock("@/lib/db", () => ({
    prisma: {
      visit: { findUnique: vi.fn(async () => visit) },
      movement: { update: movementUpdateMock },
      eventLog: { create: eventLogCreateMock },
    },
  }));
  vi.doMock("@/lib/events", () => ({ eventBus: { emit: emitMock } }));
  vi.doMock("@/lib/flightUrgency", () => ({ suggestNextState: suggestNextStateMock }));
}

async function run() {
  const { applyAutoTransition } = await import("./autoTransition");
  return applyAutoTransition({ visitId: "v1", userId: "u1", userName: "Tester" });
}

describe("applyAutoTransition", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock("@/lib/db");
    vi.doUnmock("@/lib/events");
    vi.doUnmock("@/lib/flightUrgency");
  });

  it("persists the suggested state on the DEPARTURE movement and returns it", async () => {
    mockDeps(buildVisit());
    suggestNextStateMock.mockReturnValue("ON_BLOCKS");

    const result = await run();

    expect(result).toBe("ON_BLOCKS");
    expect(movementUpdateMock).toHaveBeenCalledTimes(1);
    expect(movementUpdateMock.mock.calls[0][0]).toMatchObject({
      where: { id: "m-dep" },
      data: { state: "ON_BLOCKS" },
    });
  });

  it("logs the state CODE (not the UI label) with the movementId", async () => {
    // Regresión ata-log-codigo: deriveATA/ATD en /dia parsea el código
    // (ON_BLOCKS/OFF_BLOCKS) del EventLog.action — el label "En calzos"
    // dejaba la derivación de ATA muerta en producción.
    mockDeps(buildVisit());
    suggestNextStateMock.mockReturnValue("ON_BLOCKS");

    await run();

    expect(eventLogCreateMock).toHaveBeenCalledTimes(1);
    const logData = eventLogCreateMock.mock.calls[0][0].data;
    expect(logData.action).toBe("Auto-transición → ON_BLOCKS");
    expect(logData.action).not.toContain("En calzos");
    expect(logData.movementId).toBe("m-dep");
    expect(logData.visitId).toBe("v1");
    expect(logData.userId).toBe("u1");
  });

  it("emits flight_updated with the Spanish label in detail", async () => {
    mockDeps(buildVisit());
    suggestNextStateMock.mockReturnValue("ON_BLOCKS");

    await run();

    expect(emitMock).toHaveBeenCalledTimes(1);
    const emitted = emitMock.mock.calls[0][0];
    expect(emitted.type).toBe("flight_updated");
    expect(emitted.flightId).toBe("v1");
    expect(emitted.userId).toBe("u1");
    expect(emitted.detail).toBe("Estado → En calzos");
  });

  it("does nothing and returns null when no transition is suggested", async () => {
    mockDeps(buildVisit());
    suggestNextStateMock.mockReturnValue(null);

    const result = await run();

    expect(result).toBeNull();
    expect(movementUpdateMock).not.toHaveBeenCalled();
    expect(eventLogCreateMock).not.toHaveBeenCalled();
    expect(emitMock).not.toHaveBeenCalled();
  });

  it("does nothing when the suggested state equals the current visit state", async () => {
    // mostAdvancedState(EXPECTED, EXPECTED) = EXPECTED; sugerir EXPECTED es no-op.
    mockDeps(buildVisit());
    suggestNextStateMock.mockReturnValue("EXPECTED");

    const result = await run();

    expect(result).toBeNull();
    expect(movementUpdateMock).not.toHaveBeenCalled();
  });

  it("falls back to the ARRIVAL movement when there is no DEPARTURE leg", async () => {
    const visit = buildVisit();
    (visit as { movements: Array<{ direction: string }> }).movements =
      (visit as { movements: Array<{ direction: string }> }).movements.filter(
        (m) => m.direction === "ARRIVAL"
      );
    mockDeps(visit);
    suggestNextStateMock.mockReturnValue("ON_BLOCKS");

    const result = await run();

    expect(result).toBe("ON_BLOCKS");
    expect(movementUpdateMock.mock.calls[0][0].where.id).toBe("m-arr");
    expect(eventLogCreateMock.mock.calls[0][0].data.movementId).toBe("m-arr");
  });

  it("returns null when the visit does not exist", async () => {
    mockDeps(null);

    const result = await run();

    expect(result).toBeNull();
    expect(suggestNextStateMock).not.toHaveBeenCalled();
    expect(emitMock).not.toHaveBeenCalled();
  });
});
