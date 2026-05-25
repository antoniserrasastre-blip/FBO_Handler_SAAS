// Tests for role guard on POST /api/flights (create Visit + Movement).
// Isolated from the GET tests in route.test.ts (which cover different behaviour).

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { mockSession, resetSessionMock } from "@/test/mock-session";

beforeAll(() => {
  process.env.PASSPORT_ENCRYPTION_KEY = Buffer.alloc(32, 0).toString("base64");
});

function mockDeps() {
  vi.doMock("@/lib/db", () => ({
    prisma: {
      visit: {
        findMany: vi.fn(async () => []),
        findUnique: vi.fn(async () => null),
      },
      eventLog: { create: vi.fn(async () => ({})) },
    },
  }));
  vi.doMock("@/lib/events", () => ({ eventBus: { emit: vi.fn() } }));
  vi.doMock("@/lib/v2/upsert", () => ({
    upsertAircraft: vi.fn(async () => ({ id: "ac1" })),
    upsertVisit: vi.fn(async () => ({ record: { id: "v1" }, wasCreated: true })),
    upsertMovement: vi.fn(async () => ({ record: { id: "m1" }, wasCreated: true })),
    upsertOperator: vi.fn(async () => ({ id: "op1" })),
  }));
  vi.doMock("@/lib/operators", () => ({ findOperator: vi.fn(() => null) }));
}

function makePostRequest(body: object = {}) {
  return new NextRequest("http://localhost/api/flights", {
    method: "POST",
    body: JSON.stringify({ callsign: "NJE123AB", registration: "CS-DXX", ...body }),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/flights — role guard", () => {
  beforeEach(() => {
    vi.resetModules();
    mockDeps();
  });
  afterEach(() => {
    resetSessionMock();
    vi.doUnmock("@/lib/db");
    vi.doUnmock("@/lib/events");
    vi.doUnmock("@/lib/v2/upsert");
    vi.doUnmock("@/lib/operators");
  });

  it("returns 401 for unauthenticated request", async () => {
    mockSession(null);
    const { POST } = await import("./route");
    const res = await POST(makePostRequest());
    expect(res.status).toBe(401);
  });

  it("returns 403 for VIEWER (read-only role)", async () => {
    mockSession("VIEWER");
    const { POST } = await import("./route");
    const res = await POST(makePostRequest());
    expect(res.status).toBe(403);
  });

  it("does not reject HANDLER (writer role)", async () => {
    mockSession("HANDLER");
    const { POST } = await import("./route");
    const res = await POST(makePostRequest());
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it("does not reject SUPERVISOR", async () => {
    mockSession("SUPERVISOR");
    const { POST } = await import("./route");
    const res = await POST(makePostRequest());
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});
