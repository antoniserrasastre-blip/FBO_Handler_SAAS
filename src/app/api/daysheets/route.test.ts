// Rewritten against the v2 model.
// DELETE ?all=true is admin-only (requireAdmin). The handler deletes
// eventLog, crewAssignment, passenger, service, lostItem, movement, visit,
// and daySheet rows — all modelled in v2 Prisma schema.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { mockSession, resetSessionMock } from "@/test/mock-session";

function mockPrisma() {
  vi.doMock("@/lib/db", () => ({
    prisma: {
      eventLog: { deleteMany: vi.fn(async () => ({ count: 0 })), create: vi.fn(async () => ({})) },
      crewAssignment: { deleteMany: vi.fn(async () => ({ count: 0 })) },
      passenger: { deleteMany: vi.fn(async () => ({ count: 0 })) },
      service: { deleteMany: vi.fn(async () => ({ count: 0 })) },
      lostItem: { deleteMany: vi.fn(async () => ({ count: 0 })) },
      movement: { deleteMany: vi.fn(async () => ({ count: 0 })) },
      visit: {
        findMany: vi.fn(async () => []),
        findUnique: vi.fn(async () => null),
        deleteMany: vi.fn(async () => ({ count: 0 })),
      },
      daySheet: {
        findMany: vi.fn(async () => []),
        findUnique: vi.fn(async () => null),
        deleteMany: vi.fn(async () => ({ count: 0 })),
        upsert: vi.fn(async () => ({ date: new Date(), notes: null, closed: false })),
      },
    },
  }));
}

describe("DELETE /api/daysheets?all=true — admin-only guard", () => {
  beforeEach(() => {
    vi.resetModules();
    mockPrisma();
  });
  afterEach(() => {
    resetSessionMock();
    vi.doUnmock("@/lib/db");
  });

  it("returns 401 for unauthenticated requests", async () => {
    mockSession(null);
    const { DELETE } = await import("./route");
    const req = new NextRequest("http://localhost/api/daysheets?all=true", {
      method: "DELETE",
    });
    const res = await DELETE(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 for SUPERVISOR (admin-only operation)", async () => {
    mockSession("SUPERVISOR");
    const { DELETE } = await import("./route");
    const req = new NextRequest("http://localhost/api/daysheets?all=true", {
      method: "DELETE",
    });
    const res = await DELETE(req);
    expect(res.status).toBe(403);
  });

  it("returns 403 for HANDLER (admin-only operation)", async () => {
    mockSession("HANDLER");
    const { DELETE } = await import("./route");
    const req = new NextRequest("http://localhost/api/daysheets?all=true", {
      method: "DELETE",
    });
    const res = await DELETE(req);
    expect(res.status).toBe(403);
  });

  it("returns 200 for ADMIN", async () => {
    mockSession("ADMIN");
    const { DELETE } = await import("./route");
    const req = new NextRequest("http://localhost/api/daysheets?all=true", {
      method: "DELETE",
    });
    const res = await DELETE(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});

describe("DELETE /api/daysheets?id=<palmaDay> — supervisor guard", () => {
  beforeEach(() => {
    vi.resetModules();
    mockPrisma();
  });
  afterEach(() => {
    resetSessionMock();
    vi.doUnmock("@/lib/db");
  });

  it("returns 401 for unauthenticated requests", async () => {
    mockSession(null);
    const { DELETE } = await import("./route");
    const req = new NextRequest(
      "http://localhost/api/daysheets?id=2025-06-12T00:00:00.000Z",
      { method: "DELETE" }
    );
    const res = await DELETE(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 for HANDLER (supervisor+ required)", async () => {
    mockSession("HANDLER");
    const { DELETE } = await import("./route");
    const req = new NextRequest(
      "http://localhost/api/daysheets?id=2025-06-12T00:00:00.000Z",
      { method: "DELETE" }
    );
    const res = await DELETE(req);
    expect(res.status).toBe(403);
  });

  it("returns 200 for SUPERVISOR deleting a specific day", async () => {
    mockSession("SUPERVISOR");
    const { DELETE } = await import("./route");
    const req = new NextRequest(
      "http://localhost/api/daysheets?id=2025-06-12T00:00:00.000Z",
      { method: "DELETE" }
    );
    const res = await DELETE(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns 200 for ADMIN deleting a specific day", async () => {
    mockSession("ADMIN");
    const { DELETE } = await import("./route");
    const req = new NextRequest(
      "http://localhost/api/daysheets?id=2025-06-12T00:00:00.000Z",
      { method: "DELETE" }
    );
    const res = await DELETE(req);
    expect(res.status).toBe(200);
  });
});
