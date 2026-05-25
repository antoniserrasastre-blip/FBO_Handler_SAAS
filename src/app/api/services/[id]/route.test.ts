// Rewritten against the v2 prisma.service shape (visitId, direction).
// The service belongs to a Visit; auto-transition walks Visit→Movement.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { mockSession, resetSessionMock } from "@/test/mock-session";

// ─── shared mocks ────────────────────────────────────────────────────────────

const serviceUpdateMock = vi.fn();
const movementUpdateMock = vi.fn();
const eventLogCreateMock = vi.fn();
const emitMock = vi.fn();

/** Minimal service row returned by prisma.service.findUnique */
function buildService(overrides: Record<string, unknown> = {}) {
  return {
    id: "s1",
    visitId: "v1",         // v2: visitId (not flightId)
    type: "CATERING",
    state: "PENDING",
    direction: "DEPARTURE",
    arrivedAt: null,
    deliveredAt: null,
    customName: null,
    reference: null,
    target: null,
    quantity: null,
    ...overrides,
  };
}

/** Minimal visit returned when the auto-transition path re-queries */
function buildVisit() {
  return {
    id: "v1",
    aircraftId: "ac1",
    operatorId: null,
    palmaDay: new Date("2025-06-12T00:00:00.000Z"),
    type: "TURNAROUND",
    arrivalDate: null,
    departureDate: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    aircraft: { registration: "CS-DXX", aircraftType: "GLEX" },
    movements: [
      {
        id: "m-dep",
        direction: "DEPARTURE",
        state: "PARKED",
        callsign: "NJE001",
        etd: "11:00",
        eta: null,
        fuelState: "NOT_REQUESTED",
        toiletState: "NOT_REQUESTED",
      },
    ],
    services: [],
    lostItems: [],
  };
}

function mockPrisma() {
  serviceUpdateMock.mockReset();
  movementUpdateMock.mockReset().mockResolvedValue({});
  eventLogCreateMock.mockReset().mockResolvedValue({});
  emitMock.mockReset();

  const service = buildService();
  const visit = buildVisit();

  // Default: update returns the patched service
  serviceUpdateMock.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    ...service,
    ...data,
  }));

  vi.doMock("@/lib/db", () => ({
    prisma: {
      service: {
        findUnique: vi.fn(async () => service),
        update: serviceUpdateMock,
      },
      visit: {
        findUnique: vi.fn(async () => visit),
      },
      movement: { update: movementUpdateMock },
      eventLog: { create: eventLogCreateMock },
    },
  }));
  vi.doMock("@/lib/events", () => ({ eventBus: { emit: emitMock } }));
  vi.doMock("@/lib/flightUrgency", () => ({ suggestNextState: () => null }));
}

const params = Promise.resolve({ id: "s1" });

async function patch(body: Record<string, unknown>) {
  const { PATCH } = await import("./route");
  const req = new NextRequest("http://localhost/api/services/s1", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
  return PATCH(req, { params });
}

// ─── whitelist tests ──────────────────────────────────────────────────────────

describe("PATCH /api/services/[id] — field whitelist", () => {
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

  it("ignores visitId / flightId mutation", async () => {
    mockSession("HANDLER");
    // In v2 the relationship field is visitId; also test the old flightId name
    await patch({ visitId: "evil", flightId: "evil2", state: "DELIVERED" });

    expect(serviceUpdateMock).toHaveBeenCalled();
    const data = serviceUpdateMock.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("visitId");
    expect(data).not.toHaveProperty("flightId");
    expect(data.state).toBe("DELIVERED");
  });

  it("ignores id, createdAt, updatedAt", async () => {
    mockSession("HANDLER");
    await patch({ id: "other", createdAt: "x", updatedAt: "y", state: "ARRIVED" });

    const data = serviceUpdateMock.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("id");
    expect(data).not.toHaveProperty("createdAt");
    expect(data).not.toHaveProperty("updatedAt");
    expect(data.state).toBe("ARRIVED");
  });

  it("preserves whitelisted fields: state, customName, reference, target", async () => {
    mockSession("HANDLER");
    // Patch with a non-state-transitioning value to keep it simple
    await patch({ state: "PENDING", customName: "x", reference: "r1", target: "Pax" });

    const data = serviceUpdateMock.mock.calls[0][0].data;
    expect(data.state).toBe("PENDING");
    expect(data.customName).toBe("x");
    expect(data.reference).toBe("r1");
    expect(data.target).toBe("Pax");
  });

  it("preserves whitelisted fields: type, phase/direction, origin, quantity", async () => {
    mockSession("HANDLER");
    await patch({ type: "FUEL", direction: "ARRIVAL", origin: "FBO", quantity: 500 });

    const data = serviceUpdateMock.mock.calls[0][0].data;
    expect(data.type).toBe("FUEL");
    // direction is whitelisted; phase is aliased to direction by the handler
    expect(data.direction).toBe("ARRIVAL");
    expect(data.origin).toBe("FBO");
    expect(data.quantity).toBe(500);
  });
});

// ─── EventBus emit assertions ─────────────────────────────────────────────────

describe("PATCH /api/services/[id] — EventBus emit", () => {
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

  it("emits exactly one service_updated event with the visitId when state changes", async () => {
    mockSession("HANDLER");
    await patch({ state: "ARRIVED" });

    // The handler emits when state changes (PENDING → ARRIVED)
    expect(emitMock).toHaveBeenCalledTimes(1);

    const emitted = emitMock.mock.calls[0][0];
    expect(emitted.type).toBe("service_updated");
    // In v2 flightId on the event carries the visitId
    expect(emitted.flightId).toBe("v1");
    expect(emitted.userId).toBe("u1");
  });

  it("does NOT emit when state is unchanged", async () => {
    mockSession("HANDLER");
    // Patch a non-state field so the state-change branch is skipped
    await patch({ customName: "new name" });

    expect(emitMock).not.toHaveBeenCalled();
  });
});

// ─── auth guard tests ─────────────────────────────────────────────────────────

describe("PATCH /api/services/[id] — auth guards", () => {
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
    const res = await patch({ state: "ARRIVED" });
    expect(res.status).toBe(401);
  });

  it("returns 403 for VIEWER role", async () => {
    mockSession("VIEWER");
    const res = await patch({ state: "ARRIVED" });
    expect(res.status).toBe(403);
  });
});
