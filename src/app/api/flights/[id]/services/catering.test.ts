/**
 * catering.test.ts — Characterisation tests for POST /api/flights/[id]/services
 *
 * These tests DOCUMENT the current behaviour (green), including known decisions
 * that may need revisiting (marked BUG / DECISION).
 *
 * Companion file to route.test.ts, which only covers 401/403/201. This file
 * extends coverage to:
 *   1. Default `direction` from SERVICE_TYPE_DEFAULT_PHASE per service type.
 *   2. Legacy `phase` alias and explicit `direction` field.
 *   3. Persistence of `target`, `origin`, `reference`, `quantity`.
 *   4. Unknown `type` is NOT validated — accepted as-is (DECISION pending).
 *   5. EventBus emits `service_created` with correct shape.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { mockSession, resetSessionMock } from "@/test/mock-session";

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

let createFn: ReturnType<typeof vi.fn>;
let emitFn: ReturnType<typeof vi.fn>;

function setupMocks() {
  createFn = vi.fn(async (args: { data: Record<string, unknown> }) => ({
    id: "svc-new",
    ...args.data,
  }));
  emitFn = vi.fn();

  vi.doMock("@/lib/db", () => ({
    prisma: {
      service: { create: createFn },
      eventLog: { create: vi.fn(async () => ({})) },
    },
  }));
  vi.doMock("@/lib/events", () => ({
    eventBus: { emit: emitFn },
  }));
}

const params = Promise.resolve({ id: "visit-1" });

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/flights/visit-1/services", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// 1. Default direction per service type
// ---------------------------------------------------------------------------

describe("POST /api/flights/[id]/services — direction defaults from SERVICE_TYPE_DEFAULT_PHASE", () => {
  beforeEach(() => {
    vi.resetModules();
    setupMocks();
    mockSession("HANDLER");
  });
  afterEach(() => {
    resetSessionMock();
    vi.doUnmock("@/lib/db");
    vi.doUnmock("@/lib/events");
  });

  it("CATERING → direction defaults to DEPARTURE", async () => {
    const { POST } = await import("./route");
    await POST(makeRequest({ type: "CATERING" }), { params });
    const data = createFn.mock.calls[0][0].data;
    expect(data.direction).toBe("DEPARTURE");
  });

  it("WATER → direction defaults to ARRIVAL", async () => {
    const { POST } = await import("./route");
    await POST(makeRequest({ type: "WATER" }), { params });
    const data = createFn.mock.calls[0][0].data;
    expect(data.direction).toBe("ARRIVAL");
  });

  it("GPU → direction defaults to ARRIVAL", async () => {
    const { POST } = await import("./route");
    await POST(makeRequest({ type: "GPU" }), { params });
    const data = createFn.mock.calls[0][0].data;
    expect(data.direction).toBe("ARRIVAL");
  });

  it("ICE → direction defaults to ARRIVAL", async () => {
    const { POST } = await import("./route");
    await POST(makeRequest({ type: "ICE" }), { params });
    const data = createFn.mock.calls[0][0].data;
    expect(data.direction).toBe("ARRIVAL");
  });

  it("STAIRS → direction defaults to ARRIVAL", async () => {
    const { POST } = await import("./route");
    await POST(makeRequest({ type: "STAIRS" }), { params });
    const data = createFn.mock.calls[0][0].data;
    expect(data.direction).toBe("ARRIVAL");
  });

  it("COOLER_BAG → direction defaults to BOTH", async () => {
    const { POST } = await import("./route");
    await POST(makeRequest({ type: "COOLER_BAG" }), { params });
    const data = createFn.mock.calls[0][0].data;
    expect(data.direction).toBe("BOTH");
  });

  it("STORAGE_BAG → direction defaults to BOTH", async () => {
    const { POST } = await import("./route");
    await POST(makeRequest({ type: "STORAGE_BAG" }), { params });
    const data = createFn.mock.calls[0][0].data;
    expect(data.direction).toBe("BOTH");
  });

  it("LAUNDRY → direction defaults to BOTH", async () => {
    const { POST } = await import("./route");
    await POST(makeRequest({ type: "LAUNDRY" }), { params });
    const data = createFn.mock.calls[0][0].data;
    expect(data.direction).toBe("BOTH");
  });

  it("CLEANING → direction defaults to DEPARTURE", async () => {
    const { POST } = await import("./route");
    await POST(makeRequest({ type: "CLEANING" }), { params });
    const data = createFn.mock.calls[0][0].data;
    expect(data.direction).toBe("DEPARTURE");
  });

  it("DISHES → direction defaults to DEPARTURE", async () => {
    const { POST } = await import("./route");
    await POST(makeRequest({ type: "DISHES" }), { params });
    const data = createFn.mock.calls[0][0].data;
    expect(data.direction).toBe("DEPARTURE");
  });
});

// ---------------------------------------------------------------------------
// 2. Legacy `phase` alias and explicit `direction` field
// ---------------------------------------------------------------------------

describe("POST /api/flights/[id]/services — phase alias and direction override", () => {
  beforeEach(() => {
    vi.resetModules();
    setupMocks();
    mockSession("HANDLER");
  });
  afterEach(() => {
    resetSessionMock();
    vi.doUnmock("@/lib/db");
    vi.doUnmock("@/lib/events");
  });

  it("legacy phase:ARRIVAL overrides the type default (CATERING → ARRIVAL)", async () => {
    const { POST } = await import("./route");
    await POST(makeRequest({ type: "CATERING", phase: "ARRIVAL" }), { params });
    const data = createFn.mock.calls[0][0].data;
    expect(data.direction).toBe("ARRIVAL");
  });

  it("explicit direction:BOTH is respected and surfaced in the response", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ type: "CATERING", direction: "BOTH" }), { params });
    const data = createFn.mock.calls[0][0].data;
    expect(data.direction).toBe("BOTH");
    // Route also surfaces `phase` alias on the response for legacy UI
    const body = await res.json() as { direction: string; phase: string };
    expect(body.phase).toBe("BOTH");
  });

  it("response always includes phase alias equal to direction", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ type: "CATERING" }), { params });
    const body = await res.json() as { direction: string; phase: string };
    expect(body.phase).toBe(body.direction);
  });

  it("invalid phase value is ignored — falls back to type default", async () => {
    const { POST } = await import("./route");
    await POST(makeRequest({ type: "CATERING", phase: "INVALID_PHASE" }), { params });
    const data = createFn.mock.calls[0][0].data;
    // INVALID_PHASE is not in SERVICE_PHASES, so the route ignores it and uses the type default
    expect(data.direction).toBe("DEPARTURE");
  });

  it("direction field takes priority over phase when phase is absent", async () => {
    const { POST } = await import("./route");
    await POST(makeRequest({ type: "CATERING", direction: "ARRIVAL" }), { params });
    const data = createFn.mock.calls[0][0].data;
    expect(data.direction).toBe("ARRIVAL");
  });

  it("phase takes priority over direction when both are supplied (phase comes first in resolution)", async () => {
    // The route resolves phase first: `requestedDir = phase-check ?? direction-check ?? null`
    // So phase:ARRIVAL wins over direction:BOTH.
    const { POST } = await import("./route");
    await POST(makeRequest({ type: "CATERING", phase: "ARRIVAL", direction: "BOTH" }), { params });
    const data = createFn.mock.calls[0][0].data;
    expect(data.direction).toBe("ARRIVAL");
  });
});

// ---------------------------------------------------------------------------
// 3. Full field persistence: target, origin, reference, quantity
// ---------------------------------------------------------------------------

describe("POST /api/flights/[id]/services — persistence of catering fields", () => {
  beforeEach(() => {
    vi.resetModules();
    setupMocks();
    mockSession("HANDLER");
  });
  afterEach(() => {
    resetSessionMock();
    vi.doUnmock("@/lib/db");
    vi.doUnmock("@/lib/events");
  });

  it("persists target=PAX when supplied", async () => {
    const { POST } = await import("./route");
    await POST(makeRequest({ type: "CATERING", target: "PAX" }), { params });
    expect(createFn.mock.calls[0][0].data.target).toBe("PAX");
  });

  it("persists target=CREW when supplied", async () => {
    const { POST } = await import("./route");
    await POST(makeRequest({ type: "CATERING", target: "CREW" }), { params });
    expect(createFn.mock.calls[0][0].data.target).toBe("CREW");
  });

  it("persists origin=NETJETS when supplied", async () => {
    const { POST } = await import("./route");
    await POST(makeRequest({ type: "CATERING", origin: "NETJETS" }), { params });
    expect(createFn.mock.calls[0][0].data.origin).toBe("NETJETS");
  });

  it("persists origin=CATERING_AIRE when supplied", async () => {
    const { POST } = await import("./route");
    await POST(makeRequest({ type: "CATERING", origin: "CATERING_AIRE" }), { params });
    expect(createFn.mock.calls[0][0].data.origin).toBe("CATERING_AIRE");
  });

  it("persists reference string when supplied", async () => {
    const { POST } = await import("./route");
    await POST(makeRequest({ type: "CATERING", reference: "12248105" }), { params });
    expect(createFn.mock.calls[0][0].data.reference).toBe("12248105");
  });

  it("reference is null when omitted", async () => {
    const { POST } = await import("./route");
    await POST(makeRequest({ type: "CATERING" }), { params });
    expect(createFn.mock.calls[0][0].data.reference).toBeNull();
  });

  it("persists quantity=3 when supplied", async () => {
    const { POST } = await import("./route");
    await POST(makeRequest({ type: "CATERING", quantity: 3 }), { params });
    expect(createFn.mock.calls[0][0].data.quantity).toBe(3);
  });

  it("quantity defaults to 1 when omitted", async () => {
    const { POST } = await import("./route");
    await POST(makeRequest({ type: "CATERING" }), { params });
    expect(createFn.mock.calls[0][0].data.quantity).toBe(1);
  });

  it("visitId is the id from route params, not from the body", async () => {
    const { POST } = await import("./route");
    await POST(makeRequest({ type: "CATERING", visitId: "injected-wrong-id" }), { params });
    expect(createFn.mock.calls[0][0].data.visitId).toBe("visit-1");
  });

  it("a full NJE PAX catering payload persists all fields correctly", async () => {
    const { POST } = await import("./route");
    await POST(
      makeRequest({
        type: "CATERING",
        target: "PAX",
        origin: "NETJETS",
        reference: "98765001",
        quantity: 2,
        direction: "DEPARTURE",
      }),
      { params },
    );
    const data = createFn.mock.calls[0][0].data;
    expect(data.type).toBe("CATERING");
    expect(data.target).toBe("PAX");
    expect(data.origin).toBe("NETJETS");
    expect(data.reference).toBe("98765001");
    expect(data.quantity).toBe(2);
    expect(data.direction).toBe("DEPARTURE");
  });
});

// ---------------------------------------------------------------------------
// 4. Unknown type — no validation, accepted as-is
//
// DECISION PENDING: the route does not validate `type` against SERVICE_TYPES.
// An unknown type like "FOO" is passed straight to Prisma, which will either
// accept it (if the DB column is a plain string) or throw a DB-level error.
// In the mocked-Prisma test environment the create mock always resolves,
// so the route returns 201 with the unknown type stored.
//
// File: src/app/api/flights/[id]/services/route.ts, line 28
//   `type: body.type,`   ← no guard, no zod schema
//
// Recommendation: validate against SERVICE_TYPES and return 400 for unknowns.
// ---------------------------------------------------------------------------

describe("POST /api/flights/[id]/services — unknown type (DECISION PENDING: should return 400?)", () => {
  beforeEach(() => {
    vi.resetModules();
    setupMocks();
    mockSession("HANDLER");
  });
  afterEach(() => {
    resetSessionMock();
    vi.doUnmock("@/lib/db");
    vi.doUnmock("@/lib/events");
  });

  it("CURRENT BEHAVIOUR: unknown type 'FOO' is accepted and returns 201 (no validation)", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ type: "FOO" }), { params });
    // Documenting current behaviour: 201, type stored verbatim.
    // TODO: decide whether this should be 400 Bad Request.
    expect(res.status).toBe(201);
    const body = await res.json() as { type: string };
    expect(body.type).toBe("FOO");
  });

  it("CURRENT BEHAVIOUR: unknown type direction falls back to DEPARTURE (the hardcoded fallback)", async () => {
    const { POST } = await import("./route");
    await POST(makeRequest({ type: "FOO" }), { params });
    // SERVICE_TYPE_DEFAULT_PHASE["FOO"] is undefined → ?? "DEPARTURE" kicks in
    const data = createFn.mock.calls[0][0].data;
    expect(data.direction).toBe("DEPARTURE");
  });
});

// ---------------------------------------------------------------------------
// 5. EventBus emission
// ---------------------------------------------------------------------------

describe("POST /api/flights/[id]/services — EventBus service_created emission", () => {
  beforeEach(() => {
    vi.resetModules();
    setupMocks();
    mockSession("HANDLER");
  });
  afterEach(() => {
    resetSessionMock();
    vi.doUnmock("@/lib/db");
    vi.doUnmock("@/lib/events");
  });

  it("emits a service_created event after successful creation", async () => {
    const { POST } = await import("./route");
    await POST(makeRequest({ type: "CATERING" }), { params });
    expect(emitFn).toHaveBeenCalledOnce();
    const event = emitFn.mock.calls[0][0] as Record<string, unknown>;
    expect(event.type).toBe("service_created");
  });

  it("event flightId matches the visit id from params", async () => {
    const { POST } = await import("./route");
    await POST(makeRequest({ type: "CATERING" }), { params });
    const event = emitFn.mock.calls[0][0] as Record<string, unknown>;
    expect(event.flightId).toBe("visit-1");
  });

  it("event detail mentions the service type", async () => {
    const { POST } = await import("./route");
    await POST(makeRequest({ type: "WATER" }), { params });
    const event = emitFn.mock.calls[0][0] as Record<string, unknown>;
    expect(String(event.detail)).toContain("WATER");
  });

  it("event carries a valid ISO timestamp", async () => {
    const { POST } = await import("./route");
    await POST(makeRequest({ type: "CATERING" }), { params });
    const event = emitFn.mock.calls[0][0] as Record<string, unknown>;
    expect(typeof event.timestamp).toBe("string");
    expect(new Date(event.timestamp as string).toString()).not.toBe("Invalid Date");
  });

  it("event carries the authenticated user id", async () => {
    const { POST } = await import("./route");
    await POST(makeRequest({ type: "CATERING" }), { params });
    const event = emitFn.mock.calls[0][0] as Record<string, unknown>;
    // Session mock sets id to "u1"
    expect(event.userId).toBe("u1");
  });
});
