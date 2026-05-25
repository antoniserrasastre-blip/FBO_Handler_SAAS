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

// ─── ci_ lazy materialization tests ──────────────────────────────────────────

/**
 * Build a minimal CrewItem row as returned by prisma.crewItem.findUnique.
 */
function buildCrewItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "crew-1",
    visitId: "v1",
    type: "THERMOS",
    customName: null,
    quantity: 1,
    state: "STORED",
    notes: null,
    storedAt: new Date(),
    storedById: null,
    returnedAt: null,
    returnedById: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Build a mock prisma where:
 *  - service.findUnique returns `serviceMock` (null = not found)
 *  - crewItem.findUnique returns `crewItemMock` (null = not found)
 *  - service.upsert materializes and returns the Service mirror
 *  - service.update returns the patched service
 *  - service.delete succeeds
 */
function mockPrismaForCi({
  serviceMock,
  crewItemMock,
}: {
  serviceMock: Record<string, unknown> | null;
  crewItemMock: Record<string, unknown> | null;
}) {
  serviceUpdateMock.mockReset();
  movementUpdateMock.mockReset().mockResolvedValue({});
  eventLogCreateMock.mockReset().mockResolvedValue({});
  emitMock.mockReset();

  const serviceUpsertMock = vi.fn(async () => {
    // Returns the materialized mirror
    if (!crewItemMock) throw new Error("no crewItem");
    return {
      id: `ci_${crewItemMock.id}`,
      visitId: crewItemMock.visitId,
      type: crewItemMock.type,
      customName: crewItemMock.customName ?? null,
      quantity: crewItemMock.quantity,
      state: crewItemMock.state === "RETURNED" ? "DELIVERED" : "PENDING",
      direction: "BOTH",
      origin: "CREW",
      target: "CREW",
      rawDescription: crewItemMock.notes ?? null,
      arrivedAt: null,
      deliveredAt: null,
      reference: null,
    };
  });

  const serviceDeleteMock = vi.fn(async () => ({}));

  serviceUpdateMock.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: `ci_${(crewItemMock ?? { id: "x" }).id}`,
    visitId: "v1",
    type: "THERMOS",
    state: "PENDING",
    direction: "BOTH",
    arrivedAt: null,
    deliveredAt: null,
    customName: null,
    reference: null,
    target: "CREW",
    quantity: 1,
    ...data,
  }));

  vi.doMock("@/lib/db", () => ({
    prisma: {
      service: {
        findUnique: vi.fn(async () => serviceMock),
        upsert: serviceUpsertMock,
        update: serviceUpdateMock,
        delete: serviceDeleteMock,
      },
      crewItem: {
        findUnique: vi.fn(async () => crewItemMock),
      },
      visit: {
        findUnique: vi.fn(async () => null), // auto-transition skipped (suggestNextState returns null)
      },
      movement: { update: movementUpdateMock },
      eventLog: { create: eventLogCreateMock },
    },
  }));
  vi.doMock("@/lib/events", () => ({ eventBus: { emit: emitMock } }));
  vi.doMock("@/lib/flightUrgency", () => ({ suggestNextState: () => null }));

  return { serviceUpsertMock, serviceDeleteMock };
}

describe("PATCH /api/services/[id] — ci_ lazy materialization", () => {
  afterEach(() => {
    resetSessionMock();
    vi.doUnmock("@/lib/db");
    vi.doUnmock("@/lib/events");
    vi.doUnmock("@/lib/flightUrgency");
  });

  it("PATCH ci_<id> when Service mirror does NOT exist but CrewItem DOES — materializes and applies change (not 404)", async () => {
    vi.resetModules();
    const crewItem = buildCrewItem(); // id="crew-1", state="STORED"
    const { serviceUpsertMock } = mockPrismaForCi({
      serviceMock: null,        // Service not yet in DB
      crewItemMock: crewItem,   // CrewItem exists
    });
    mockSession("HANDLER");

    const ciId = `ci_${crewItem.id}`;
    const { PATCH } = await import("./route");
    const req = new NextRequest(`http://localhost/api/services/${ciId}`, {
      method: "PATCH",
      body: JSON.stringify({ state: "DELIVERED" }),
      headers: { "content-type": "application/json" },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: ciId }) });

    // Must NOT be 404
    expect(res.status).toBe(200);
    // The mirror must have been materialized via upsert
    expect(serviceUpsertMock).toHaveBeenCalledTimes(1);
    // The update must have been called with the new state
    expect(serviceUpdateMock).toHaveBeenCalledTimes(1);
    const updateArgs = serviceUpdateMock.mock.calls[0][0];
    expect(updateArgs.where.id).toBe(ciId);
    expect(updateArgs.data.state).toBe("DELIVERED");
  });

  it("PATCH ci_<id> when Service mirror DOES exist — works as a normal service (no upsert)", async () => {
    vi.resetModules();
    const crewItem = buildCrewItem();
    const ciId = `ci_${crewItem.id}`;
    // Mirror already exists — findUnique returns it directly
    const existingMirror = {
      id: ciId,
      visitId: "v1",
      type: "THERMOS",
      state: "PENDING",
      direction: "BOTH",
      arrivedAt: null,
      deliveredAt: null,
      customName: null,
      reference: null,
      target: "CREW",
      quantity: 1,
    };
    const { serviceUpsertMock } = mockPrismaForCi({
      serviceMock: existingMirror,
      crewItemMock: crewItem,
    });
    mockSession("HANDLER");

    const { PATCH } = await import("./route");
    const req = new NextRequest(`http://localhost/api/services/${ciId}`, {
      method: "PATCH",
      body: JSON.stringify({ state: "DELIVERED" }),
      headers: { "content-type": "application/json" },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: ciId }) });

    expect(res.status).toBe(200);
    // No materialization needed — mirror already existed
    expect(serviceUpsertMock).not.toHaveBeenCalled();
    // Update still applied
    expect(serviceUpdateMock).toHaveBeenCalledTimes(1);
  });

  it("PATCH ci_<id> when neither Service nor CrewItem exist — returns 404", async () => {
    vi.resetModules();
    mockPrismaForCi({
      serviceMock: null,
      crewItemMock: null,   // no CrewItem either
    });
    mockSession("HANDLER");

    const ciId = "ci_nonexistent";
    const { PATCH } = await import("./route");
    const req = new NextRequest(`http://localhost/api/services/${ciId}`, {
      method: "PATCH",
      body: JSON.stringify({ state: "DELIVERED" }),
      headers: { "content-type": "application/json" },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: ciId }) });

    expect(res.status).toBe(404);
    expect(serviceUpdateMock).not.toHaveBeenCalled();
  });

  it("DELETE ci_<id> when Service mirror does NOT exist but CrewItem DOES — materializes and deletes (not 404)", async () => {
    vi.resetModules();
    const crewItem = buildCrewItem();
    const { serviceUpsertMock, serviceDeleteMock } = mockPrismaForCi({
      serviceMock: null,
      crewItemMock: crewItem,
    });
    mockSession("HANDLER");

    const ciId = `ci_${crewItem.id}`;
    const { DELETE } = await import("./route");
    const req = new NextRequest(`http://localhost/api/services/${ciId}`, {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: ciId }) });

    expect(res.status).toBe(200);
    // Mirror materialized before delete
    expect(serviceUpsertMock).toHaveBeenCalledTimes(1);
    // Then deleted
    expect(serviceDeleteMock).toHaveBeenCalledTimes(1);
    const deleteCall = (serviceDeleteMock.mock.calls[0] as unknown) as [{ where: { id: string } }];
    expect(deleteCall[0].where.id).toBe(ciId);
  });

  it("DELETE ci_<id> when neither Service nor CrewItem exist — returns 404", async () => {
    vi.resetModules();
    const { serviceUpsertMock, serviceDeleteMock } = mockPrismaForCi({
      serviceMock: null,
      crewItemMock: null,
    });
    mockSession("HANDLER");

    const ciId = "ci_ghost";
    const { DELETE } = await import("./route");
    const req = new NextRequest(`http://localhost/api/services/${ciId}`, {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: ciId }) });

    expect(res.status).toBe(404);
    expect(serviceUpsertMock).not.toHaveBeenCalled();
    expect(serviceDeleteMock).not.toHaveBeenCalled();
  });

  it("materialized Service starts with correct direction=BOTH and state=PENDING for a STORED CrewItem", async () => {
    vi.resetModules();
    const crewItem = buildCrewItem({ state: "STORED", type: "THERMOS" });
    const { serviceUpsertMock } = mockPrismaForCi({
      serviceMock: null,
      crewItemMock: crewItem,
    });
    mockSession("HANDLER");

    const ciId = `ci_${crewItem.id}`;
    const { PATCH } = await import("./route");
    const req = new NextRequest(`http://localhost/api/services/${ciId}`, {
      method: "PATCH",
      body: JSON.stringify({ customName: "updated-name" }),
      headers: { "content-type": "application/json" },
    });
    await PATCH(req, { params: Promise.resolve({ id: ciId }) });

    // Inspect the create data passed to upsert
    type UpsertArg = { create: { direction: string; state: string; origin: string; target: string } };
    const upsertCalls = (serviceUpsertMock.mock.calls as unknown) as [UpsertArg][];
    const upsertCall = upsertCalls[0]![0];
    expect(upsertCall.create.direction).toBe("BOTH");
    expect(upsertCall.create.state).toBe("PENDING");   // STORED → PENDING
    expect(upsertCall.create.origin).toBe("CREW");
    expect(upsertCall.create.target).toBe("CREW");
  });
});
