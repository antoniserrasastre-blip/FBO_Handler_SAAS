/**
 * reconcile.test.ts — Reconciliation (additive-only) behaviour of PUT /api/import/extras.
 *
 * BUSINESS RULE: the import is the WEB'S SUBORDINATE.
 *   - It ONLY adds what is not already present.
 *   - It NEVER deletes or modifies existing services (manual or previously imported).
 *   - Re-importing the same Excel must be idempotent (no duplicates).
 *
 * EQUIVALENCE KEY documented in route.ts:
 *   With reference (NJE):  type|REF:<reference>
 *   Without reference:     type|<direction>|<target>|<customName>
 *
 * Each test sets up a `service.findMany` mock that returns a controlled set of
 * "already present" rows, then checks how many times `service.create` is called.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { mockSession, resetSessionMock } from "@/test/mock-session";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

type CreateFn = ReturnType<typeof vi.fn>;
type FindManyFn = ReturnType<typeof vi.fn>;

interface ExistingServiceRow {
  type: string;
  direction: string;
  target: string | null;
  reference: string | null;
  customName: string | null;
}

interface ImportedService {
  type: string;
  name: string;
  quantity?: number;
  origin?: string;
  reference?: string;
  target?: string;
}

interface ImportedExtra {
  registration: string;
  date?: string;
  rawDescriptions: string[];
  services: ImportedService[];
}

let serviceCreateFn: CreateFn;
let serviceFindManyFn: FindManyFn;

/**
 * Set up all mocks for a PUT call.
 *
 * @param existingServices  Rows already in DB for the matching visit (visitId="v-1").
 * @param incomingExtras    The `extras` array as if already parsed from Excel.
 */
function setupMocks(existingServices: ExistingServiceRow[], incomingExtras: ImportedExtra[]) {
  serviceCreateFn = vi.fn(async () => ({ id: "svc-new" }));
  serviceFindManyFn = vi.fn(async ({ where }: { where?: { visitId?: string } }) => {
    // Return existing services only for visit "v-1"
    if (where?.visitId === "v-1") return existingServices;
    return [];
  });

  vi.doMock("@/lib/db", () => ({
    prisma: {
      visit: {
        findMany: vi.fn(async () => [
          {
            id: "v-1",
            aircraftId: "ac-1",
            aircraft: { registration: "CS-DXX" },
            palmaDay: new Date("2026-04-13T00:00:00Z"),
            departureDate: null,
          },
        ]),
      },
      service: {
        create: serviceCreateFn,
        findMany: serviceFindManyFn,
      },
      eventLog: { create: vi.fn(async () => ({})) },
    },
  }));

  vi.doMock("@/lib/events", () => ({ eventBus: { emit: vi.fn() } }));

  vi.doMock("@/lib/excelParser", () => ({
    parseExtrasExcel: vi.fn(() => ({
      date: "2026-04-13",
      extras: incomingExtras,
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

function makePutRequest(extras: ImportedExtra[]) {
  return new NextRequest("http://localhost/api/import/extras", {
    method: "PUT",
    body: JSON.stringify({ date: "2026-04-13", extras }),
    headers: { "content-type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("PUT /api/import/extras — additive reconciler", () => {
  afterEach(() => {
    resetSessionMock();
    vi.doUnmock("@/lib/db");
    vi.doUnmock("@/lib/events");
    vi.doUnmock("@/lib/excelParser");
    vi.doUnmock("@/lib/v2/upsert");
    vi.doUnmock("@/lib/uploadValidation");
    vi.doUnmock("@/lib/time");
  });

  // -------------------------------------------------------------------------
  // Scenario 1: Web has a CATERING, Excel brings the same CATERING
  // Expected: NO new service created (the web entry wins, no duplicate)
  // -------------------------------------------------------------------------
  it("does NOT duplicate a service already present from the web", async () => {
    vi.resetModules();
    const existing: ExistingServiceRow[] = [
      // Manually added via the web — no origin, same type/direction
      { type: "CATERING", direction: "DEPARTURE", target: null, reference: null, customName: "Catering Aire 10:00" },
    ];
    const incoming: ImportedExtra[] = [
      {
        registration: "CS-DXX",
        date: "2026-04-13",
        rawDescriptions: ["CATERING"],
        services: [{ type: "CATERING", name: "Catering Aire 10:00", quantity: 1, origin: "Catering Aire" }],
      },
    ];
    setupMocks(existing, incoming);
    mockSession("HANDLER");

    const { PUT } = await import("./route");
    const res = await PUT(makePutRequest(incoming));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(serviceCreateFn).not.toHaveBeenCalled();
    expect(body.servicesCreated).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Scenario 2: Excel brings a service the web does NOT have
  // Expected: one new service created
  // -------------------------------------------------------------------------
  it("adds a service that is NOT already present in the visit", async () => {
    vi.resetModules();
    const existing: ExistingServiceRow[] = []; // visit is empty
    const incoming: ImportedExtra[] = [
      {
        registration: "CS-DXX",
        date: "2026-04-13",
        rawDescriptions: ["VAJILLA"],
        services: [{ type: "DISHES", name: "VAJILLA", quantity: 1 }],
      },
    ];
    setupMocks(existing, incoming);
    mockSession("HANDLER");

    const { PUT } = await import("./route");
    const res = await PUT(makePutRequest(incoming));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(serviceCreateFn).toHaveBeenCalledTimes(1);
    expect(body.servicesCreated).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Scenario 3: Reimport same Excel twice → no duplicates
  // Simulated by: existing already contains what the first import would have written
  // -------------------------------------------------------------------------
  it("is idempotent — reimporting the same Excel does not create duplicates", async () => {
    vi.resetModules();
    // Simulate state AFTER a first import: the thermos row is already there
    const existing: ExistingServiceRow[] = [
      { type: "THERMOS", direction: "DEPARTURE", target: null, reference: null, customName: "TERMO" },
    ];
    const incoming: ImportedExtra[] = [
      {
        registration: "CS-DXX",
        date: "2026-04-13",
        rawDescriptions: ["TERMO"],
        services: [{ type: "THERMOS", name: "TERMO", quantity: 1 }],
      },
    ];
    setupMocks(existing, incoming);
    mockSession("HANDLER");

    const { PUT } = await import("./route");
    const res = await PUT(makePutRequest(incoming));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(serviceCreateFn).not.toHaveBeenCalled();
    expect(body.servicesCreated).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Scenario 4: Web has a service that Excel does NOT bring → must remain intact
  // (The route must NOT delete anything — we verify no delete call on service)
  // -------------------------------------------------------------------------
  it("leaves untouched a web service that the Excel does not mention", async () => {
    vi.resetModules();
    // The visit has a GPU service added manually — Excel says nothing about it
    const existing: ExistingServiceRow[] = [
      { type: "GPU", direction: "ARRIVAL", target: null, reference: null, customName: null },
    ];
    const incoming: ImportedExtra[] = [
      {
        registration: "CS-DXX",
        date: "2026-04-13",
        rawDescriptions: ["VAJILLA"],
        services: [{ type: "DISHES", name: "VAJILLA", quantity: 1 }],
      },
    ];
    setupMocks(existing, incoming);
    // Verify there is no `deleteMany` or `delete` on service in the mock
    const deleteFn = vi.fn();
    // Override to also expose a delete fn we can assert on
    vi.doMock("@/lib/db", () => ({
      prisma: {
        visit: {
          findMany: vi.fn(async () => [
            {
              id: "v-1",
              aircraftId: "ac-1",
              aircraft: { registration: "CS-DXX" },
              palmaDay: new Date("2026-04-13T00:00:00Z"),
              departureDate: null,
            },
          ]),
        },
        service: {
          create: serviceCreateFn,
          findMany: serviceFindManyFn,
          delete: deleteFn,
          deleteMany: deleteFn,
        },
        eventLog: { create: vi.fn(async () => ({})) },
      },
    }));
    mockSession("HANDLER");

    const { PUT } = await import("./route");
    await PUT(makePutRequest(incoming));

    // GPU must NOT have been touched
    expect(deleteFn).not.toHaveBeenCalled();
    // The DISHES service IS new so it should have been created
    expect(serviceCreateFn).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Scenario 5: NJE with a different reference → treated as a distinct service
  // -------------------------------------------------------------------------
  it("adds a new NJE service when its reference differs from existing ones", async () => {
    vi.resetModules();
    // Existing NJE with ref 12297037
    const existing: ExistingServiceRow[] = [
      { type: "CATERING", direction: "DEPARTURE", target: "PAX", reference: "12297037", customName: "NJE PAX #12297037" },
    ];
    // Incoming NJE with a different ref 99999999
    const incoming: ImportedExtra[] = [
      {
        registration: "CS-DXX",
        date: "2026-04-13",
        rawDescriptions: [],
        services: [
          { type: "CATERING", name: "NJE PAX #99999999", quantity: 1, origin: "NetJets", target: "PAX", reference: "99999999" },
        ],
      },
    ];
    setupMocks(existing, incoming);
    mockSession("HANDLER");

    const { PUT } = await import("./route");
    const res = await PUT(makePutRequest(incoming));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(serviceCreateFn).toHaveBeenCalledTimes(1);
    expect(body.servicesCreated).toBe(1);
    const data = (serviceCreateFn.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.reference).toBe("99999999");
  });

  // -------------------------------------------------------------------------
  // Scenario 6: NJE with the same reference → skip (no duplicate)
  // -------------------------------------------------------------------------
  it("skips a NJE service whose reference is already in the visit", async () => {
    vi.resetModules();
    const existing: ExistingServiceRow[] = [
      { type: "CATERING", direction: "DEPARTURE", target: "PAX", reference: "12297037", customName: "NJE PAX #12297037" },
    ];
    const incoming: ImportedExtra[] = [
      {
        registration: "CS-DXX",
        date: "2026-04-13",
        rawDescriptions: [],
        services: [
          { type: "CATERING", name: "NJE PAX #12297037", quantity: 1, origin: "NetJets", target: "PAX", reference: "12297037" },
        ],
      },
    ];
    setupMocks(existing, incoming);
    mockSession("HANDLER");

    const { PUT } = await import("./route");
    const res = await PUT(makePutRequest(incoming));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(serviceCreateFn).not.toHaveBeenCalled();
    expect(body.servicesCreated).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Scenario 7: quantity=2, 1 already exists → create only 1 more
  // -------------------------------------------------------------------------
  it("creates only the missing quantity when some slots are already present", async () => {
    vi.resetModules();
    // One THERMOS already in DB
    const existing: ExistingServiceRow[] = [
      { type: "THERMOS", direction: "DEPARTURE", target: null, reference: null, customName: "2 TERMOS" },
    ];
    // Excel says quantity=2
    const incoming: ImportedExtra[] = [
      {
        registration: "CS-DXX",
        date: "2026-04-13",
        rawDescriptions: ["2 TERMOS"],
        services: [{ type: "THERMOS", name: "2 TERMOS", quantity: 2 }],
      },
    ];
    setupMocks(existing, incoming);
    mockSession("HANDLER");

    const { PUT } = await import("./route");
    const res = await PUT(makePutRequest(incoming));
    const body = await res.json();

    expect(res.status).toBe(200);
    // Only 1 created, not 2
    expect(serviceCreateFn).toHaveBeenCalledTimes(1);
    expect(body.servicesCreated).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Scenario 8: quantity=2, both already exist → create nothing
  // -------------------------------------------------------------------------
  it("creates nothing when all quantity slots are already present", async () => {
    vi.resetModules();
    const existing: ExistingServiceRow[] = [
      { type: "THERMOS", direction: "DEPARTURE", target: null, reference: null, customName: "2 TERMOS" },
      { type: "THERMOS", direction: "DEPARTURE", target: null, reference: null, customName: "2 TERMOS" },
    ];
    const incoming: ImportedExtra[] = [
      {
        registration: "CS-DXX",
        date: "2026-04-13",
        rawDescriptions: ["2 TERMOS"],
        services: [{ type: "THERMOS", name: "2 TERMOS", quantity: 2 }],
      },
    ];
    setupMocks(existing, incoming);
    mockSession("HANDLER");

    const { PUT } = await import("./route");
    const res = await PUT(makePutRequest(incoming));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(serviceCreateFn).not.toHaveBeenCalled();
    expect(body.servicesCreated).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Scenario 9: mixed — some services already present, some new
  // -------------------------------------------------------------------------
  it("creates only the truly new services when a mix is present", async () => {
    vi.resetModules();
    // CATERING already in DB (from web); DISHES is new
    const existing: ExistingServiceRow[] = [
      { type: "CATERING", direction: "DEPARTURE", target: null, reference: null, customName: "Catering Aire 10:00" },
    ];
    const incoming: ImportedExtra[] = [
      {
        registration: "CS-DXX",
        date: "2026-04-13",
        rawDescriptions: ["CATERING", "VAJILLA"],
        services: [
          { type: "CATERING", name: "Catering Aire 10:00", quantity: 1, origin: "Catering Aire" },
          { type: "DISHES", name: "VAJILLA", quantity: 1 },
        ],
      },
    ];
    setupMocks(existing, incoming);
    mockSession("HANDLER");

    const { PUT } = await import("./route");
    const res = await PUT(makePutRequest(incoming));
    const body = await res.json();

    expect(res.status).toBe(200);
    // Only DISHES is created; CATERING was already there
    expect(serviceCreateFn).toHaveBeenCalledTimes(1);
    expect(body.servicesCreated).toBe(1);
    const data = (serviceCreateFn.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.type).toBe("DISHES");
  });

  // -------------------------------------------------------------------------
  // Scenario 10: empty visit — Excel adds everything
  // -------------------------------------------------------------------------
  it("creates all services when the visit has none yet", async () => {
    vi.resetModules();
    const existing: ExistingServiceRow[] = [];
    const incoming: ImportedExtra[] = [
      {
        registration: "CS-DXX",
        date: "2026-04-13",
        rawDescriptions: ["CATERING", "VAJILLA"],
        services: [
          { type: "CATERING", name: "Catering Aire 10:00", quantity: 1, origin: "Catering Aire" },
          { type: "DISHES", name: "VAJILLA", quantity: 1 },
        ],
      },
    ];
    setupMocks(existing, incoming);
    mockSession("HANDLER");

    const { PUT } = await import("./route");
    const res = await PUT(makePutRequest(incoming));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(serviceCreateFn).toHaveBeenCalledTimes(2);
    expect(body.servicesCreated).toBe(2);
  });
});
