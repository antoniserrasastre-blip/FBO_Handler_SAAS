// Rewritten against the v2 prisma.visit + prisma.movement mock shape.
// The handler (route.ts) routes each PATCH field to Visit, ARRIVAL Movement,
// or DEPARTURE Movement via routeFieldToMovement().

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { mockSession, resetSessionMock } from "@/test/mock-session";

// ─── shared mocks ────────────────────────────────────────────────────────────

const visitUpdateMock = vi.fn();
const movementUpdateMock = vi.fn();
const aircraftUpdateMock = vi.fn();
const eventLogCreateMock = vi.fn();
const emitMock = vi.fn();

/**
 * Build a minimal v2 Visit returned by loadVisit() (prisma.visit.findUnique
 * with include: { aircraft, movements, services, lostItems }).
 *
 * Overrides can be passed to adjust individual movement fields so each test
 * can assert the right routing.
 */
function buildVisit(overrides: Record<string, unknown> = {}) {
  return {
    id: "v1",
    aircraftId: "ac1",
    operatorId: "op1",
    palmaDay: new Date("2025-06-12T00:00:00.000Z"),
    type: "TURNAROUND",
    arrivalDate: new Date("2025-06-12T08:30:00.000Z"),
    departureDate: new Date("2025-06-12T11:00:00.000Z"),
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
        ata: null,
        origin: "LFPB",
        scheduledDate: new Date("2025-06-12T08:30:00.000Z"),
        paxCount: 4,
        crewCount: 2,
        state: "PARKED",
        fuelState: "NOT_REQUESTED",
        toiletState: "NOT_REQUESTED",
        parking: null,
      },
      {
        id: "m-dep",
        direction: "DEPARTURE",
        callsign: "NJE001",
        etd: "11:00",
        atd: null,
        destination: "EGGW",
        scheduledDate: new Date("2025-06-12T11:00:00.000Z"),
        paxCount: 4,
        crewCount: 2,
        state: "PARKED",
        fuelState: "NOT_REQUESTED",
        toiletState: "NOT_REQUESTED",
        parking: null,
      },
    ],
    services: [],
    lostItems: [],
    ...overrides,
  };
}

function mockPrisma() {
  visitUpdateMock.mockReset().mockResolvedValue({});
  movementUpdateMock.mockReset().mockResolvedValue({});
  aircraftUpdateMock.mockReset().mockResolvedValue({});
  eventLogCreateMock.mockReset().mockResolvedValue({});
  emitMock.mockReset();

  const visit = buildVisit();

  vi.doMock("@/lib/db", () => ({
    prisma: {
      visit: {
        findUnique: vi.fn(async () => visit),
        update: visitUpdateMock,
        delete: vi.fn(async () => ({})),
      },
      movement: { update: movementUpdateMock },
      aircraft: { update: aircraftUpdateMock },
      eventLog: { create: eventLogCreateMock },
    },
  }));
  vi.doMock("@/lib/events", () => ({ eventBus: { emit: emitMock } }));
  vi.doMock("@/lib/flightUrgency", () => ({ suggestNextState: () => null }));
}

const params = Promise.resolve({ id: "v1" });

async function patch(body: Record<string, unknown>) {
  const { PATCH } = await import("./route");
  const req = new NextRequest("http://localhost/api/flights/v1", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
  return PATCH(req, { params });
}

// ─── whitelist tests ──────────────────────────────────────────────────────────

describe("PATCH /api/flights/[id] — field whitelist", () => {
  beforeEach(() => {
    vi.resetModules();
    mockPrisma();
  });
  afterEach(() => {
    resetSessionMock();
    vi.doUnmock("@/lib/db");
    vi.doUnmock("@/lib/events");
    vi.doUnmock("@/lib/flightUrgency");
  });

  it("ignores non-whitelisted fields like daySheetId and routes 'state' to DEPARTURE", async () => {
    mockSession("HANDLER");
    await patch({ daySheetId: "evil", state: "ON_BLOCKS" });

    // movementUpdateMock should have been called for the DEPARTURE movement with state
    const depCall = movementUpdateMock.mock.calls.find(
      (c) => c[0].where?.id === "m-dep"
    );
    expect(depCall).toBeDefined();
    expect(depCall![0].data).toHaveProperty("state", "ON_BLOCKS");

    // daySheetId must not appear in any update call
    const allData = movementUpdateMock.mock.calls.map((c) => c[0].data);
    for (const d of allData) {
      expect(d).not.toHaveProperty("daySheetId");
    }
    const visitData = visitUpdateMock.mock.calls.map((c) => c[0].data);
    for (const d of visitData) {
      expect(d).not.toHaveProperty("daySheetId");
    }
  });

  it("ignores id, createdAt, updatedAt in PATCH body", async () => {
    mockSession("HANDLER");
    await patch({ id: "other", createdAt: "1970", updatedAt: "2099", notes: "ok" });

    // 'notes' is a visit-level field → visitUpdate should contain it
    const visitCall = visitUpdateMock.mock.calls[0];
    expect(visitCall).toBeDefined();
    expect(visitCall[0].data).toHaveProperty("notes", "ok");

    // Banned fields must not leak into any update
    const allCalls = [
      ...movementUpdateMock.mock.calls.map((c) => c[0].data),
      ...visitUpdateMock.mock.calls.map((c) => c[0].data),
    ];
    for (const d of allCalls) {
      expect(d).not.toHaveProperty("id");
      expect(d).not.toHaveProperty("createdAt");
      expect(d).not.toHaveProperty("updatedAt");
    }
  });

  it("preserves common editable fields and routes each to the correct movement", async () => {
    mockSession("HANDLER");
    await patch({
      state: "PARKED",
      fuelState: "REQUESTED",
      paxDeparture: 4,
      eta: "10:00",
      etd: "12:00",
      parking: "P3",
      notes: "test",
    });

    // state, fuelState, paxDeparture, etd, parking → DEPARTURE
    const depCall = movementUpdateMock.mock.calls.find(
      (c) => c[0].where?.id === "m-dep"
    );
    expect(depCall).toBeDefined();
    expect(depCall![0].data).toMatchObject({
      state: "PARKED",
      fuelState: "REQUESTED",
      paxCount: 4,     // paxDeparture maps to paxCount on Movement
      etd: "12:00",
      parking: "P3",
    });

    // eta → ARRIVAL
    const arrCall = movementUpdateMock.mock.calls.find(
      (c) => c[0].where?.id === "m-arr"
    );
    expect(arrCall).toBeDefined();
    expect(arrCall![0].data).toHaveProperty("eta", "10:00");

    // notes → Visit
    expect(visitUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ notes: "test" }) })
    );
  });
});

// ─── Movement routing tests ───────────────────────────────────────────────────

describe("PATCH /api/flights/[id] — routeFieldToMovement routing", () => {
  beforeEach(() => {
    vi.resetModules();
    mockPrisma();
  });
  afterEach(() => {
    resetSessionMock();
    vi.doUnmock("@/lib/db");
    vi.doUnmock("@/lib/events");
    vi.doUnmock("@/lib/flightUrgency");
  });

  it("routes paxArrival to ARRIVAL movement (paxCount)", async () => {
    mockSession("HANDLER");
    await patch({ paxArrival: 6 });

    const arrCall = movementUpdateMock.mock.calls.find(
      (c) => c[0].where?.id === "m-arr"
    );
    expect(arrCall).toBeDefined();
    expect(arrCall![0].data).toHaveProperty("paxCount", 6);

    // Must NOT go to DEPARTURE
    const depCall = movementUpdateMock.mock.calls.find(
      (c) => c[0].where?.id === "m-dep"
    );
    expect(depCall).toBeUndefined();
  });

  it("routes paxDeparture to DEPARTURE movement (paxCount)", async () => {
    mockSession("HANDLER");
    await patch({ paxDeparture: 3 });

    const depCall = movementUpdateMock.mock.calls.find(
      (c) => c[0].where?.id === "m-dep"
    );
    expect(depCall).toBeDefined();
    expect(depCall![0].data).toHaveProperty("paxCount", 3);

    // Must NOT go to ARRIVAL
    const arrCall = movementUpdateMock.mock.calls.find(
      (c) => c[0].where?.id === "m-arr"
    );
    expect(arrCall).toBeUndefined();
  });

  it("routes destination and etd to DEPARTURE movement", async () => {
    mockSession("HANDLER");
    await patch({ destination: "LEMD", etd: "15:30" });

    const depCall = movementUpdateMock.mock.calls.find(
      (c) => c[0].where?.id === "m-dep"
    );
    expect(depCall).toBeDefined();
    expect(depCall![0].data).toMatchObject({ destination: "LEMD", etd: "15:30" });
  });

  it("routes origin and eta to ARRIVAL movement", async () => {
    mockSession("HANDLER");
    await patch({ origin: "LFPB", eta: "09:45" });

    const arrCall = movementUpdateMock.mock.calls.find(
      (c) => c[0].where?.id === "m-arr"
    );
    expect(arrCall).toBeDefined();
    expect(arrCall![0].data).toMatchObject({ origin: "LFPB", eta: "09:45" });
  });
});

// ─── EventBus emit assertions ─────────────────────────────────────────────────

describe("PATCH /api/flights/[id] — EventBus emit", () => {
  beforeEach(() => {
    vi.resetModules();
    mockPrisma();
  });
  afterEach(() => {
    resetSessionMock();
    vi.doUnmock("@/lib/db");
    vi.doUnmock("@/lib/events");
    vi.doUnmock("@/lib/flightUrgency");
  });

  it("emits exactly one flight_updated event with the visitId after a PATCH", async () => {
    mockSession("HANDLER");
    await patch({ state: "PARKED" });

    // Exactly one emit call (no auto-transition since suggestNextState returns null)
    expect(emitMock).toHaveBeenCalledTimes(1);

    const emitted = emitMock.mock.calls[0][0];
    expect(emitted.type).toBe("flight_updated");
    // In v2 the flightId on the event is the visitId
    expect(emitted.flightId).toBe("v1");
    expect(emitted.userId).toBe("u1");
  });

  it("emits with the correct visitId when patching arrival-leg fields", async () => {
    mockSession("HANDLER");
    await patch({ paxArrival: 5 });

    expect(emitMock).toHaveBeenCalledTimes(1);
    const emitted = emitMock.mock.calls[0][0];
    expect(emitted.type).toBe("flight_updated");
    expect(emitted.flightId).toBe("v1");
  });
});

// ─── auth guard tests ─────────────────────────────────────────────────────────

describe("PATCH /api/flights/[id] — auth guards", () => {
  beforeEach(() => {
    vi.resetModules();
    mockPrisma();
  });
  afterEach(() => {
    resetSessionMock();
    vi.doUnmock("@/lib/db");
    vi.doUnmock("@/lib/events");
    vi.doUnmock("@/lib/flightUrgency");
  });

  it("returns 401 for unauthenticated requests", async () => {
    mockSession(null);
    const res = await patch({ state: "PARKED" });
    expect(res.status).toBe(401);
  });

  it("returns 403 for VIEWER role", async () => {
    mockSession("VIEWER");
    const res = await patch({ state: "PARKED" });
    expect(res.status).toBe(403);
  });
});
