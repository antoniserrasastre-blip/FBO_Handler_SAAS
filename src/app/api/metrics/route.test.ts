// Tests for the pax split fix in GET /api/metrics.
// Business rule: turnarounds must NOT double-count pax.
// The global KPI and per-day stats must expose paxArrival + paxDeparture
// as separate fields, never a merged totalPax / paxTotal.
// paxCountReal (handler override) takes precedence over paxCount (estimated).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { mockSession, resetSessionMock } from "@/test/mock-session";

// ---- helpers ---------------------------------------------------------------

function makeMovement(opts: {
  direction: string;
  paxCount: number;
  paxCountReal?: number | null;
  eta?: string;
  etd?: string;
  callsign?: string;
  origin?: string;
  destination?: string;
  scheduledDate?: Date;
}) {
  return {
    id: `m-${Math.random()}`,
    direction: opts.direction,
    callsign: opts.callsign ?? "NJE001AB",
    origin: opts.direction === "ARRIVAL" ? (opts.origin ?? "LFPB") : null,
    destination: opts.direction === "DEPARTURE" ? (opts.destination ?? "EGGW") : null,
    scheduledDate: opts.scheduledDate ?? new Date("2026-05-24T10:00:00.000Z"),
    eta: opts.direction === "ARRIVAL" ? (opts.eta ?? "10:00") : null,
    etd: opts.direction === "DEPARTURE" ? (opts.etd ?? "12:00") : null,
    ata: null,
    atd: null,
    state: "PARKED",
    paxCount: opts.paxCount,
    paxCountReal: opts.paxCountReal ?? null,
    crewCount: 2,
    crewCountReal: null,
    parking: null,
    tobt: null,
    bagsChecked: 0,
    bagsCabin: 0,
    bagsState: "IN_AIRCRAFT",
    transportType: "UNDEFINED",
    transportState: "PENDING",
    paxState: "IN_AIRCRAFT",
    crewLocation: "IN_AIRCRAFT",
    fuelState: "NOT_REQUESTED",
    fuelRequestedAt: null,
    fuelServedAt: null,
    toiletState: "NOT_REQUESTED",
    toiletRequestedAt: null,
    toiletCompletedAt: null,
    rqstNumber: null,
    flightCategory: "COMMERCIAL",
    modifiedFlag: false,
    petCount: 0,
    passengers: [],
    crewAssignments: [],
  };
}

function makeVisit(opts: {
  palmaDay?: Date;
  type?: string;
  movements: ReturnType<typeof makeMovement>[];
}) {
  return {
    id: `v-${Math.random()}`,
    aircraftId: "ac-1",
    operatorId: "op-1",
    palmaDay: opts.palmaDay ?? new Date("2026-05-24T00:00:00.000Z"),
    type: opts.type ?? "TURNAROUND",
    arrivalDate: new Date("2026-05-24T10:00:00.000Z"),
    departureDate: new Date("2026-05-24T12:00:00.000Z"),
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    aircraft: { registration: "CS-DXX", aircraftType: "GLEX" },
    movements: opts.movements,
    services: [],
    lostItems: [],
  };
}

function mockPrismaWith(visits: ReturnType<typeof makeVisit>[]) {
  vi.doMock("@/lib/db", () => ({
    prisma: {
      visit: { findMany: vi.fn(async () => visits) },
      // Handler-analytics queries added upstream (#56 vuelo assignment + carga
      // del equipo). The pax-split assertions don't depend on them, so empty
      // results keep these tests focused while satisfying the route's calls.
      user: { findMany: vi.fn(async () => []) },
      eventLog: { groupBy: vi.fn(async () => []) },
    },
  }));
}

async function callGet(range = "30") {
  const { GET } = await import("./route");
  const req = new NextRequest(`http://localhost/api/metrics?range=${range}`);
  return GET(req);
}

// ---- test suite ------------------------------------------------------------

describe("GET /api/metrics — pax split (no double-count)", () => {
  beforeEach(() => {
    vi.resetModules();
    mockSession("HANDLER");
  });
  afterEach(() => {
    resetSessionMock();
    vi.doUnmock("@/lib/db");
  });

  it("turnaround 4+4: global paxArrival=4 paxDeparture=4; no totalPax=8", async () => {
    mockPrismaWith([
      makeVisit({
        movements: [
          makeMovement({ direction: "ARRIVAL", paxCount: 4 }),
          makeMovement({ direction: "DEPARTURE", paxCount: 4 }),
        ],
      }),
    ]);
    const res = await callGet();
    expect(res.status).toBe(200);
    const body = await res.json();

    // Top-level KPIs
    expect(body.paxArrival).toBe(4);
    expect(body.paxDeparture).toBe(4);
    expect(body.totalPax).toBeUndefined();

    // Per-day stats
    const day = body.dailyStats[0];
    expect(day.paxArrival).toBe(4);
    expect(day.paxDeparture).toBe(4);
    expect(day.paxTotal).toBeUndefined();
  });

  it("paxCountReal present on ARRIVAL: uses 3 not 4 in both global and daily stats", async () => {
    mockPrismaWith([
      makeVisit({
        movements: [
          makeMovement({ direction: "ARRIVAL", paxCount: 4, paxCountReal: 3 }),
          makeMovement({ direction: "DEPARTURE", paxCount: 4, paxCountReal: null }),
        ],
      }),
    ]);
    const res = await callGet();
    const body = await res.json();
    expect(body.paxArrival).toBe(3);   // paxCountReal wins
    expect(body.paxDeparture).toBe(4); // fallback to paxCount

    const day = body.dailyStats[0];
    expect(day.paxArrival).toBe(3);
    expect(day.paxDeparture).toBe(4);
  });

  it("paxCountReal present on DEPARTURE: uses 2 not 4", async () => {
    mockPrismaWith([
      makeVisit({
        movements: [
          makeMovement({ direction: "ARRIVAL", paxCount: 4, paxCountReal: null }),
          makeMovement({ direction: "DEPARTURE", paxCount: 4, paxCountReal: 2 }),
        ],
      }),
    ]);
    const res = await callGet();
    const body = await res.json();
    expect(body.paxArrival).toBe(4);
    expect(body.paxDeparture).toBe(2);

    const day = body.dailyStats[0];
    expect(day.paxArrival).toBe(4);
    expect(day.paxDeparture).toBe(2);
  });

  it("arrival-only visit: paxDeparture is 0 globally and per-day", async () => {
    mockPrismaWith([
      makeVisit({
        type: "ARRIVAL",
        movements: [
          makeMovement({ direction: "ARRIVAL", paxCount: 6 }),
        ],
      }),
    ]);
    const res = await callGet();
    const body = await res.json();
    expect(body.paxArrival).toBe(6);
    expect(body.paxDeparture).toBe(0);
    expect(body.dailyStats[0].paxArrival).toBe(6);
    expect(body.dailyStats[0].paxDeparture).toBe(0);
  });

  it("departure-only visit: paxArrival is 0 globally and per-day", async () => {
    mockPrismaWith([
      makeVisit({
        type: "DEPARTURE",
        movements: [
          makeMovement({ direction: "DEPARTURE", paxCount: 5 }),
        ],
      }),
    ]);
    const res = await callGet();
    const body = await res.json();
    expect(body.paxArrival).toBe(0);
    expect(body.paxDeparture).toBe(5);
    expect(body.dailyStats[0].paxArrival).toBe(0);
    expect(body.dailyStats[0].paxDeparture).toBe(5);
  });

  it("multiple visits: sums correctly by direction across the whole range", async () => {
    // Visit A: turnaround 3/3. Visit B: arrival-only 2.
    mockPrismaWith([
      makeVisit({
        movements: [
          makeMovement({ direction: "ARRIVAL", paxCount: 3 }),
          makeMovement({ direction: "DEPARTURE", paxCount: 3 }),
        ],
      }),
      makeVisit({
        movements: [
          makeMovement({ direction: "ARRIVAL", paxCount: 2 }),
        ],
      }),
    ]);
    const res = await callGet();
    const body = await res.json();
    expect(body.paxArrival).toBe(5);   // 3 + 2
    expect(body.paxDeparture).toBe(3); // 3 + 0
    expect(body.totalPax).toBeUndefined();
  });
});
