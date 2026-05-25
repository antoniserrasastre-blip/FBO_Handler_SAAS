// Tests for role guard on PUT /api/import/extras (Excel services persist).
// The guard must reject before any DB work is done.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { mockSession, resetSessionMock } from "@/test/mock-session";

function mockDeps() {
  vi.doMock("@/lib/db", () => ({
    prisma: {
      visit: {
        findMany: vi.fn(async () => []),
        update: vi.fn(async () => ({})),
      },
      service: { create: vi.fn(async () => ({})) },
      eventLog: { create: vi.fn(async () => ({})) },
    },
  }));
  vi.doMock("@/lib/events", () => ({ eventBus: { emit: vi.fn() } }));
  vi.doMock("@/lib/excelParser", () => ({
    parseExtrasExcel: vi.fn(() => ({ date: "2025-01-01", extras: [], errors: [] })),
  }));
  vi.doMock("@/lib/v2/upsert", () => ({
    upsertAircraft: vi.fn(async () => ({ id: "ac1" })),
    upsertVisit: vi.fn(async () => ({ id: "v1", aircraftId: "ac1" })),
  }));
  vi.doMock("@/lib/uploadValidation", () => ({
    validateUpload: vi.fn(() => ({ ok: true })),
    validateContentLength: vi.fn(() => ({ ok: true })),
  }));
}

function makePutRequest(body: object) {
  return new NextRequest("http://localhost/api/import/extras", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("PUT /api/import/extras — role guard", () => {
  beforeEach(() => {
    vi.resetModules();
    mockDeps();
  });
  afterEach(() => {
    resetSessionMock();
    vi.doUnmock("@/lib/db");
    vi.doUnmock("@/lib/events");
    vi.doUnmock("@/lib/excelParser");
    vi.doUnmock("@/lib/v2/upsert");
    vi.doUnmock("@/lib/uploadValidation");
  });

  it("returns 401 for unauthenticated request", async () => {
    mockSession(null);
    const { PUT } = await import("./route");
    const res = await PUT(makePutRequest({ date: "2025-01-01", extras: [] }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for VIEWER (read-only role)", async () => {
    mockSession("VIEWER");
    const { PUT } = await import("./route");
    const res = await PUT(makePutRequest({ date: "2025-01-01", extras: [] }));
    expect(res.status).toBe(403);
  });

  it("does not reject HANDLER (writer role)", async () => {
    mockSession("HANDLER");
    const { PUT } = await import("./route");
    const res = await PUT(makePutRequest({ date: "2025-01-01", extras: [] }));
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it("does not reject ADMIN", async () => {
    mockSession("ADMIN");
    const { PUT } = await import("./route");
    const res = await PUT(makePutRequest({ date: "2025-01-01", extras: [] }));
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});
