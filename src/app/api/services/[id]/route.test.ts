import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { mockSession, resetSessionMock } from "@/test/mock-session";

const updateMock = vi.fn();

function mockPrisma() {
  updateMock.mockReset();
  updateMock.mockImplementation(async ({ data }) => ({ id: "s1", flightId: "f1", ...data }));
  vi.doMock("@/lib/db", () => ({
    prisma: {
      service: {
        findUnique: vi.fn(async () => ({ id: "s1", flightId: "f1", type: "CATERING", state: "PENDING" })),
        update: updateMock,
      },
      eventLog: { create: vi.fn(async () => ({})) },
      flight: { findUnique: vi.fn(async () => null), update: vi.fn() },
    },
  }));
  vi.doMock("@/lib/events", () => ({ eventBus: { emit: vi.fn() } }));
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

describe("PATCH /api/services/[id] field whitelist", () => {
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

  it("ignores flightId mutation", async () => {
    mockSession("HANDLER");
    await patch({ flightId: "evil", state: "DELIVERED" });
    const data = updateMock.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("flightId");
    expect(data.state).toBe("DELIVERED");
  });

  it("ignores id/createdAt/updatedAt", async () => {
    mockSession("HANDLER");
    await patch({ id: "other", createdAt: "x", updatedAt: "y", state: "ARRIVED" });
    const data = updateMock.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("id");
    expect(data).not.toHaveProperty("createdAt");
    expect(data).not.toHaveProperty("updatedAt");
    expect(data.state).toBe("ARRIVED");
  });

  it("preserves whitelisted fields", async () => {
    mockSession("HANDLER");
    await patch({ state: "DELIVERED", customName: "x", reference: "r1", target: "Pax" });
    const data = updateMock.mock.calls[0][0].data;
    expect(data.state).toBe("DELIVERED");
    expect(data.customName).toBe("x");
    expect(data.reference).toBe("r1");
    expect(data.target).toBe("Pax");
  });
});
