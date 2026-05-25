// Tests for role guard on PUT /api/import (PDF persist).
// The guard must reject before any DB or parser work is done.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { mockSession, resetSessionMock } from "@/test/mock-session";

function mockDeps() {
  vi.doMock("@/lib/db", () => ({
    prisma: {
      visit: { update: vi.fn(async () => ({})) },
      eventLog: { create: vi.fn(async () => ({})) },
    },
  }));
  vi.doMock("@/lib/events", () => ({ eventBus: { emit: vi.fn() } }));
  vi.doMock("@/lib/pdfParser", () => ({
    parseCybermaxPdf: vi.fn(async () => ({ date: "01/01", flights: [], errors: [] })),
    parseDate: vi.fn(() => new Date("2025-01-01T00:00:00.000Z")),
  }));
  vi.doMock("@/lib/v2/upsert", () => ({
    upsertAircraft: vi.fn(async () => ({ id: "ac1" })),
    upsertVisit: vi.fn(async () => ({
      id: "v1",
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    upsertMovement: vi.fn(async () => ({})),
    upsertOperator: vi.fn(async () => ({ id: "op1" })),
  }));
  vi.doMock("@/lib/operators", () => ({ findOperator: vi.fn(() => null) }));
  vi.doMock("@/lib/pdfPolyfills", () => ({}));
  vi.doMock("@/lib/uploadValidation", () => ({
    validateUpload: vi.fn(() => ({ ok: true })),
    validateContentLength: vi.fn(() => ({ ok: true })),
  }));
}

function makePutRequest(body: object) {
  return new NextRequest("http://localhost/api/import", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("PUT /api/import — role guard", () => {
  beforeEach(() => {
    vi.resetModules();
    mockDeps();
  });
  afterEach(() => {
    resetSessionMock();
    vi.doUnmock("@/lib/db");
    vi.doUnmock("@/lib/events");
    vi.doUnmock("@/lib/pdfParser");
    vi.doUnmock("@/lib/v2/upsert");
    vi.doUnmock("@/lib/operators");
    vi.doUnmock("@/lib/pdfPolyfills");
    vi.doUnmock("@/lib/uploadValidation");
  });

  it("returns 401 for unauthenticated request", async () => {
    mockSession(null);
    const { PUT } = await import("./route");
    const res = await PUT(makePutRequest({ date: "01/01/2025", flights: [] }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for VIEWER (read-only role)", async () => {
    mockSession("VIEWER");
    const { PUT } = await import("./route");
    const res = await PUT(makePutRequest({ date: "01/01/2025", flights: [] }));
    expect(res.status).toBe(403);
  });

  it("does not reject HANDLER (writer role)", async () => {
    mockSession("HANDLER");
    const { PUT } = await import("./route");
    const res = await PUT(makePutRequest({ date: "01/01/2025", flights: [] }));
    // Guard passed — will get 200 (empty import) not 401/403
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it("does not reject SUPERVISOR", async () => {
    mockSession("SUPERVISOR");
    const { PUT } = await import("./route");
    const res = await PUT(makePutRequest({ date: "01/01/2025", flights: [] }));
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});
