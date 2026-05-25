/**
 * quantity.test.ts — Characterisation: quantity:N from the parser creates N rows
 * in PUT /api/import/extras.
 *
 * The excelParser already produces ParsedService.quantity (e.g., "2 TERMOS"
 * yields {type:"THERMOS", quantity:2}). The import route (line 144) loops:
 *
 *   for (let i = 0; i < (svc.quantity || 1); i++) {
 *     await prisma.service.create({ ... });
 *   }
 *
 * These tests document that the route correctly expands quantity into N separate
 * DB rows, and that services with quantity=1 (or quantity=undefined) create a
 * single row.
 *
 * We mock parseExtrasExcel to return a controlled payload, so no real Excel
 * file is needed.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { mockSession, resetSessionMock } from "@/test/mock-session";

type CreateFn = ReturnType<typeof vi.fn>;

let serviceCreateFn: CreateFn;

function setupMocks(extras: unknown[]) {
  serviceCreateFn = vi.fn(async () => ({ id: "svc-mock" }));

  vi.doMock("@/lib/db", () => ({
    prisma: {
      visit: {
        findMany: vi.fn(async () => [
          // One matching visit: registration CS-DXX
          {
            id: "v-1",
            aircraftId: "ac-1",
            aircraft: { registration: "CS-DXX" },
            palmaDay: new Date("2026-04-13T00:00:00Z"),
          },
        ]),
        update: vi.fn(async () => ({})),
      },
      // findMany returns [] → visit is empty → full quantity is always created
      service: { create: serviceCreateFn, findMany: vi.fn(async () => []) },
      eventLog: { create: vi.fn(async () => ({})) },
    },
  }));

  vi.doMock("@/lib/events", () => ({ eventBus: { emit: vi.fn() } }));

  vi.doMock("@/lib/excelParser", () => ({
    parseExtrasExcel: vi.fn(() => ({
      date: "2026-04-13",
      extras,
      errors: [],
    })),
  }));

  vi.doMock("@/lib/v2/upsert", () => ({
    upsertAircraft: vi.fn(async () => ({ id: "ac-1" })),
    upsertVisit: vi.fn(async () => ({ record: { id: "v-1", aircraftId: "ac-1" } })),
  }));

  vi.doMock("@/lib/uploadValidation", () => ({
    validateUpload: vi.fn(() => ({ ok: true })),
    validateContentLength: vi.fn(() => ({ ok: true })),
  }));

  vi.doMock("@/lib/time", () => ({
    palmaDayUtc: vi.fn(() => new Date("2026-04-13T00:00:00Z")),
    madridWallMinutes: vi.fn(() => 600),
    dateToSqlString: vi.fn((d: Date) => d.toISOString().slice(0, 10)),
  }));
}

function makePutRequest(extras: unknown[]) {
  return new NextRequest("http://localhost/api/import/extras", {
    method: "PUT",
    body: JSON.stringify({ date: "2026-04-13", extras }),
    headers: { "content-type": "application/json" },
  });
}

describe("PUT /api/import/extras — quantity expands to N service rows", () => {
  afterEach(() => {
    resetSessionMock();
    vi.doUnmock("@/lib/db");
    vi.doUnmock("@/lib/events");
    vi.doUnmock("@/lib/excelParser");
    vi.doUnmock("@/lib/v2/upsert");
    vi.doUnmock("@/lib/uploadValidation");
    vi.doUnmock("@/lib/time");
  });

  it("quantity=1 (default) creates exactly 1 service row", async () => {
    vi.resetModules();
    setupMocks([
      {
        registration: "CS-DXX",
        date: "2026-04-13",
        rawDescriptions: ["CATERING"],
        services: [{ type: "CATERING", name: "Catering Aire 10:00", quantity: 1, origin: "Catering Aire" }],
      },
    ]);
    mockSession("HANDLER");
    const { PUT } = await import("./route");
    await PUT(makePutRequest([
      {
        registration: "CS-DXX",
        date: "2026-04-13",
        rawDescriptions: ["CATERING"],
        services: [{ type: "CATERING", name: "Catering Aire 10:00", quantity: 1, origin: "Catering Aire" }],
      },
    ]));
    expect(serviceCreateFn).toHaveBeenCalledTimes(1);
  });

  it("quantity=2 (e.g. '2 TERMOS') creates exactly 2 service rows", async () => {
    vi.resetModules();
    setupMocks([
      {
        registration: "CS-DXX",
        date: "2026-04-13",
        rawDescriptions: ["2 TERMOS"],
        services: [{ type: "THERMOS", name: "2 TERMOS", quantity: 2 }],
      },
    ]);
    mockSession("HANDLER");
    const { PUT } = await import("./route");
    await PUT(makePutRequest([
      {
        registration: "CS-DXX",
        date: "2026-04-13",
        rawDescriptions: ["2 TERMOS"],
        services: [{ type: "THERMOS", name: "2 TERMOS", quantity: 2 }],
      },
    ]));
    expect(serviceCreateFn).toHaveBeenCalledTimes(2);
  });

  it("quantity=3 creates exactly 3 service rows", async () => {
    vi.resetModules();
    setupMocks([
      {
        registration: "CS-DXX",
        date: "2026-04-13",
        rawDescriptions: ["3 BOLSAS NEVERA"],
        services: [{ type: "COOLER_BAG", name: "3 BOLSAS NEVERA", quantity: 3 }],
      },
    ]);
    mockSession("HANDLER");
    const { PUT } = await import("./route");
    await PUT(makePutRequest([
      {
        registration: "CS-DXX",
        date: "2026-04-13",
        rawDescriptions: ["3 BOLSAS NEVERA"],
        services: [{ type: "COOLER_BAG", name: "3 BOLSAS NEVERA", quantity: 3 }],
      },
    ]));
    expect(serviceCreateFn).toHaveBeenCalledTimes(3);
  });

  it("undefined quantity defaults to 1 row", async () => {
    vi.resetModules();
    setupMocks([
      {
        registration: "CS-DXX",
        date: "2026-04-13",
        rawDescriptions: ["VAJILLA"],
        services: [{ type: "DISHES", name: "VAJILLA" }],
      },
    ]);
    mockSession("HANDLER");
    const { PUT } = await import("./route");
    await PUT(makePutRequest([
      {
        registration: "CS-DXX",
        date: "2026-04-13",
        rawDescriptions: ["VAJILLA"],
        services: [{ type: "DISHES", name: "VAJILLA" }],
      },
    ]));
    expect(serviceCreateFn).toHaveBeenCalledTimes(1);
  });

  it("two services with quantity=1 each create 2 rows total", async () => {
    vi.resetModules();
    setupMocks([
      {
        registration: "CS-DXX",
        date: "2026-04-13",
        rawDescriptions: ["CATERING", "VAJILLA"],
        services: [
          { type: "CATERING", name: "Catering Aire 10:00", quantity: 1, origin: "Catering Aire" },
          { type: "DISHES", name: "VAJILLA", quantity: 1 },
        ],
      },
    ]);
    mockSession("HANDLER");
    const { PUT } = await import("./route");
    await PUT(makePutRequest([
      {
        registration: "CS-DXX",
        date: "2026-04-13",
        rawDescriptions: ["CATERING", "VAJILLA"],
        services: [
          { type: "CATERING", name: "Catering Aire 10:00", quantity: 1, origin: "Catering Aire" },
          { type: "DISHES", name: "VAJILLA", quantity: 1 },
        ],
      },
    ]));
    expect(serviceCreateFn).toHaveBeenCalledTimes(2);
  });

  it("each expanded row has quantity=1 in the DB (the route always writes quantity:1 per row)", async () => {
    // The route expands quantity via a loop and writes quantity:1 to each DB row
    // (src/app/api/import/extras/route.ts line 156: quantity: 1)
    // This means the quantity information from the parser is NOT stored on the Service
    // record — it is consumed purely as a loop counter. Each DB row is atomic (qty=1).
    vi.resetModules();
    setupMocks([
      {
        registration: "CS-DXX",
        date: "2026-04-13",
        rawDescriptions: ["2 TERMOS"],
        services: [{ type: "THERMOS", name: "2 TERMOS", quantity: 2 }],
      },
    ]);
    mockSession("HANDLER");
    const { PUT } = await import("./route");
    await PUT(makePutRequest([
      {
        registration: "CS-DXX",
        date: "2026-04-13",
        rawDescriptions: ["2 TERMOS"],
        services: [{ type: "THERMOS", name: "2 TERMOS", quantity: 2 }],
      },
    ]));
    // Both calls to service.create should have quantity:1
    for (const call of serviceCreateFn.mock.calls) {
      const data = (call[0] as { data: Record<string, unknown> }).data;
      expect(data.quantity).toBe(1);
    }
  });

  it("NJE PAX catering target=PAX and origin=NETJETS are written per row", async () => {
    vi.resetModules();
    setupMocks([
      {
        registration: "CS-DXX",
        date: "2026-04-13",
        rawDescriptions: [],
        services: [
          { type: "CATERING", name: "NJE PAX #12248105", quantity: 1, origin: "NetJets", target: "PAX", reference: "12248105" },
        ],
      },
    ]);
    mockSession("HANDLER");
    const { PUT } = await import("./route");
    await PUT(makePutRequest([
      {
        registration: "CS-DXX",
        date: "2026-04-13",
        rawDescriptions: [],
        services: [
          { type: "CATERING", name: "NJE PAX #12248105", quantity: 1, origin: "NetJets", target: "PAX", reference: "12248105" },
        ],
      },
    ]));
    expect(serviceCreateFn).toHaveBeenCalledTimes(1);
    const data = (serviceCreateFn.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.target).toBe("PAX");
    expect(data.origin).toBe("NETJETS"); // ORIGIN_MAP: "NetJets" → "NETJETS"
    expect(data.reference).toBe("12248105");
  });

  it("NJE CREW catering target=CREW and origin=NETJETS are written per row", async () => {
    vi.resetModules();
    setupMocks([
      {
        registration: "CS-DXX",
        date: "2026-04-13",
        rawDescriptions: [],
        services: [
          { type: "CATERING", name: "NJE CREW #12274481", quantity: 1, origin: "NetJets", target: "CREW", reference: "12274481" },
        ],
      },
    ]);
    mockSession("HANDLER");
    const { PUT } = await import("./route");
    await PUT(makePutRequest([
      {
        registration: "CS-DXX",
        date: "2026-04-13",
        rawDescriptions: [],
        services: [
          { type: "CATERING", name: "NJE CREW #12274481", quantity: 1, origin: "NetJets", target: "CREW", reference: "12274481" },
        ],
      },
    ]));
    const data = (serviceCreateFn.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.target).toBe("CREW");
    expect(data.origin).toBe("NETJETS");
    expect(data.reference).toBe("12274481");
  });
});
