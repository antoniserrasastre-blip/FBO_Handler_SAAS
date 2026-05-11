import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { mockSession, resetSessionMock } from "@/test/mock-session";

function mockPrisma() {
  vi.doMock("@/lib/db", () => ({
    prisma: {
      service: { create: vi.fn(async (args) => ({ id: "s1", ...args.data })) },
      eventLog: { create: vi.fn(async () => ({})) },
    },
  }));
  vi.doMock("@/lib/events", () => ({
    eventBus: { emit: vi.fn() },
  }));
}

const params = Promise.resolve({ id: "f1" });

describe("POST /api/flights/[id]/services", () => {
  beforeEach(() => {
    vi.resetModules();
    mockPrisma();
  });
  afterEach(() => {
    resetSessionMock();
    vi.doUnmock("@/lib/db");
    vi.doUnmock("@/lib/events");
  });

  it("returns 403 for VIEWER (read-only)", async () => {
    mockSession("VIEWER");
    const { POST } = await import("./route");
    const req = new NextRequest("http://localhost/api/flights/f1/services", {
      method: "POST",
      body: JSON.stringify({ type: "CATERING" }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(403);
  });

  it("returns 201 for HANDLER", async () => {
    mockSession("HANDLER");
    const { POST } = await import("./route");
    const req = new NextRequest("http://localhost/api/flights/f1/services", {
      method: "POST",
      body: JSON.stringify({ type: "CATERING" }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(201);
  });

  it("returns 401 for unauthenticated", async () => {
    mockSession(null);
    const { POST } = await import("./route");
    const req = new NextRequest("http://localhost/api/flights/f1/services", {
      method: "POST",
      body: JSON.stringify({ type: "CATERING" }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(401);
  });
});
