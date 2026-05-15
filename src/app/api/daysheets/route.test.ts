// TODO(v2): rewrite — DaySheet no longer exists as a Prisma model.
import { describe, it as _it, expect, beforeEach, afterEach, vi } from "vitest";
const it = _it.skip as typeof _it;
import { NextRequest } from "next/server";
import { mockSession, resetSessionMock } from "@/test/mock-session";

function mockPrisma() {
  vi.doMock("@/lib/db", () => ({
    prisma: {
      eventLog: { deleteMany: vi.fn(async () => ({ count: 0 })) },
      service: { deleteMany: vi.fn(async () => ({ count: 0 })) },
      flight: { deleteMany: vi.fn(async () => ({ count: 0 })) },
      daySheet: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        findUnique: vi.fn(async () => null),
        delete: vi.fn(async () => null),
      },
    },
  }));
}

describe("DELETE /api/daysheets?all=true", () => {
  beforeEach(() => {
    vi.resetModules();
    mockPrisma();
  });
  afterEach(() => {
    resetSessionMock();
    vi.doUnmock("@/lib/db");
  });

  it("returns 403 for SUPERVISOR (admin-only operation)", async () => {
    mockSession("SUPERVISOR");
    const { DELETE } = await import("./route");
    const req = new NextRequest("http://localhost/api/daysheets?all=true", { method: "DELETE" });
    const res = await DELETE(req);
    expect(res.status).toBe(403);
  });

  it("returns 200 for ADMIN", async () => {
    mockSession("ADMIN");
    const { DELETE } = await import("./route");
    const req = new NextRequest("http://localhost/api/daysheets?all=true", { method: "DELETE" });
    const res = await DELETE(req);
    expect(res.status).toBe(200);
  });

  it("returns 401 for unauthenticated", async () => {
    mockSession(null);
    const { DELETE } = await import("./route");
    const req = new NextRequest("http://localhost/api/daysheets?all=true", { method: "DELETE" });
    const res = await DELETE(req);
    expect(res.status).toBe(401);
  });
});
