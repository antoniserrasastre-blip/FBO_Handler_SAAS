// Tests for role guard on POST /api/import/netjets-pax (PII persist).
// The guard must reject before the microservice or DB are touched.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { mockSession, resetSessionMock } from "@/test/mock-session";

beforeEach(() => {
  // crypto requires the encryption key env var
  process.env.PASSPORT_ENCRYPTION_KEY = Buffer.alloc(32, 0).toString("base64");
});

function mockDeps() {
  vi.doMock("@/lib/db", () => ({
    prisma: {
      movement: {
        findFirst: vi.fn(async () => null),
        update: vi.fn(async () => ({})),
      },
      crewMember: {
        findUnique: vi.fn(async () => null),
        create: vi.fn(async () => ({ id: "cm1" })),
        update: vi.fn(async () => ({})),
      },
      crewAssignment: { upsert: vi.fn(async () => ({})) },
      passenger: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => ({})),
        update: vi.fn(async () => ({})),
      },
      eventLog: { create: vi.fn(async () => ({})) },
    },
  }));
  vi.doMock("@/lib/events", () => ({ eventBus: { emit: vi.fn() } }));
  vi.doMock("@/lib/v2/upsert", () => ({
    upsertAircraft: vi.fn(async () => ({ id: "ac1" })),
    upsertVisit: vi.fn(async () => ({ id: "v1" })),
    upsertMovement: vi.fn(async () => ({ id: "m1" })),
    upsertOperator: vi.fn(async () => ({ id: "op1" })),
  }));
  vi.doMock("@/lib/operators", () => ({ findOperator: vi.fn(() => null) }));
  vi.doMock("@/lib/uploadValidation", () => ({
    validateUpload: vi.fn(() => ({ ok: true })),
    validateContentLength: vi.fn(() => ({ ok: true })),
  }));
  // Stub out the microservice fetch so the test never makes HTTP calls.
  // For guard tests the route is blocked before callMicroservice() anyway,
  // but we mock it defensively so a guard-bypass would not hang.
  vi.doMock("node-fetch", () => ({ default: vi.fn() }));
}

function makePostRequest() {
  // The endpoint reads from FormData; we supply one PDF stub.
  const formData = new FormData();
  formData.append("pdf", new Blob(["fake"], { type: "application/pdf" }), "test.pdf");
  return new NextRequest("http://localhost/api/import/netjets-pax", {
    method: "POST",
    body: formData,
  });
}

describe("POST /api/import/netjets-pax — role guard", () => {
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
    vi.doUnmock("@/lib/uploadValidation");
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

  it("does not reject HANDLER (writer role) based on auth", async () => {
    // Guard passes; microservice is not configured so it may return a different
    // error (502/400), but not 401 or 403.
    mockSession("HANDLER");
    const { POST } = await import("./route");
    const res = await POST(makePostRequest());
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it("does not reject SUPERVISOR based on auth", async () => {
    mockSession("SUPERVISOR");
    const { POST } = await import("./route");
    const res = await POST(makePostRequest());
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});
