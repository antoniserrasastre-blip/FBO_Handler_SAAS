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

describe("GET /api/daysheets — conteo por movimiento (B3)", () => {
  const D1 = new Date("2026-06-10T00:00:00.000Z");
  const D2 = new Date("2026-06-11T00:00:00.000Z");

  function movement(direction: string, scheduledDate: Date, state = "EXPECTED") {
    return { direction, scheduledDate, state, paxCount: 2, paxCountReal: null };
  }

  beforeEach(() => {
    vi.resetModules();
    vi.doMock("@/lib/db", () => ({
      prisma: {
        visit: {
          findMany: vi.fn(async () => [
            // Turnaround del D1: llegada y salida el mismo día.
            {
              palmaDay: D1,
              movements: [movement("ARRIVAL", D1, "OFF_BLOCKS"), movement("DEPARTURE", D1, "OFF_BLOCKS")],
              services: [],
            },
            // Pernocta anclada en D1 cuya salida cae en D2: la salida debe
            // contar en D2, no en el palmaDay de la visit.
            {
              palmaDay: D1,
              movements: [movement("ARRIVAL", D1), movement("DEPARTURE", D2)],
              services: [],
            },
          ]),
        },
        daySheet: { findMany: vi.fn(async () => []) },
      },
    }));
  });
  afterEach(() => {
    resetSessionMock();
    vi.doUnmock("@/lib/db");
  });

  it("counts arrivals/departures per movement date and keeps visits separate", async () => {
    mockSession("HANDLER");
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{
      id: string;
      totalFlights: number;
      visits: number;
      arrivals: number;
      departures: number;
    }>;

    const day1 = body.find((d) => d.id === D1.toISOString());
    expect(day1).toBeTruthy();
    expect(day1!.visits).toBe(2);
    expect(day1!.totalFlights).toBe(2); // compat: nº de visits
    expect(day1!.arrivals).toBe(2);
    expect(day1!.departures).toBe(1); // la salida de la pernocta NO cuenta aquí

    // D2 se materializa por el movimiento de salida aunque ninguna visit
    // tenga palmaDay = D2.
    const day2 = body.find((d) => d.id === D2.toISOString());
    expect(day2).toBeTruthy();
    expect(day2!.visits).toBe(0);
    expect(day2!.arrivals).toBe(0);
    expect(day2!.departures).toBe(1);
  });

  it("returns 401 without session", async () => {
    mockSession(null);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(401);
  });
});
