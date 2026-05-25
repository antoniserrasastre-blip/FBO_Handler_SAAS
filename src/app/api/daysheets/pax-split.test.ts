// Tests for the pax split fix in GET /api/daysheets.
// Business rule: turnarounds must NOT double-count pax.
// The response must expose paxArrival + paxDeparture as separate fields,
// never a merged totalPax.
// paxCountReal (handler override) takes precedence over paxCount (estimated).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mockSession, resetSessionMock } from "@/test/mock-session";

// ---- helpers ---------------------------------------------------------------

/** Build a Visit row matching what prisma.visit.findMany returns with the
 *  includes used by GET /api/daysheets:
 *    movements: { select: { paxCount, paxCountReal, state } }
 *    services:  { select: { state } }
 */
function makeVisit(opts: {
  palmaDay?: Date;
  movements: { direction: string; paxCount: number; paxCountReal?: number | null; state?: string }[];
}) {
  return {
    id: `v-${Math.random()}`,
    palmaDay: opts.palmaDay ?? new Date("2026-05-24T00:00:00.000Z"),
    movements: opts.movements.map((m) => ({
      direction: m.direction,
      paxCount: m.paxCount,
      paxCountReal: m.paxCountReal ?? null,
      state: m.state ?? "PARKED",
    })),
    services: [],
  };
}

function mockPrismaWith(visits: ReturnType<typeof makeVisit>[]) {
  vi.doMock("@/lib/db", () => ({
    prisma: {
      visit: { findMany: vi.fn(async () => visits) },
      daySheet: { findMany: vi.fn(async () => []) },
    },
  }));
}

async function callGet() {
  const { GET } = await import("./route");
  return GET();
}

// ---- test suite ------------------------------------------------------------

describe("GET /api/daysheets — pax split (no double-count)", () => {
  beforeEach(() => {
    vi.resetModules();
    mockSession("HANDLER");
  });
  afterEach(() => {
    resetSessionMock();
    vi.doUnmock("@/lib/db");
  });

  it("turnaround: ARRIVAL paxCount 4 + DEPARTURE paxCount 4 → paxArrival=4 paxDeparture=4, no 8 anywhere", async () => {
    mockPrismaWith([
      makeVisit({
        movements: [
          { direction: "ARRIVAL", paxCount: 4 },
          { direction: "DEPARTURE", paxCount: 4 },
        ],
      }),
    ]);
    const res = await callGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    const day = body[0];
    expect(day.paxArrival).toBe(4);
    expect(day.paxDeparture).toBe(4);
    // The merged totalPax field must not exist
    expect(day.totalPax).toBeUndefined();
    // Neither field should be 8 (the old double-count)
    expect(day.paxArrival).not.toBe(8);
    expect(day.paxDeparture).not.toBe(8);
  });

  it("paxCountReal present on ARRIVAL: uses real count (3), not estimated (4)", async () => {
    mockPrismaWith([
      makeVisit({
        movements: [
          { direction: "ARRIVAL", paxCount: 4, paxCountReal: 3 },
          { direction: "DEPARTURE", paxCount: 4, paxCountReal: null },
        ],
      }),
    ]);
    const res = await callGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    const day = body[0];
    expect(day.paxArrival).toBe(3);   // uses paxCountReal
    expect(day.paxDeparture).toBe(4); // falls back to paxCount
  });

  it("paxCountReal present on DEPARTURE: uses real count (2), not estimated (4)", async () => {
    mockPrismaWith([
      makeVisit({
        movements: [
          { direction: "ARRIVAL", paxCount: 4, paxCountReal: null },
          { direction: "DEPARTURE", paxCount: 4, paxCountReal: 2 },
        ],
      }),
    ]);
    const res = await callGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    const day = body[0];
    expect(day.paxArrival).toBe(4);   // falls back to paxCount
    expect(day.paxDeparture).toBe(2); // uses paxCountReal
  });

  it("arrival-only visit: paxDeparture is 0", async () => {
    mockPrismaWith([
      makeVisit({
        movements: [{ direction: "ARRIVAL", paxCount: 6 }],
      }),
    ]);
    const res = await callGet();
    const body = await res.json();
    const day = body[0];
    expect(day.paxArrival).toBe(6);
    expect(day.paxDeparture).toBe(0);
  });

  it("departure-only visit: paxArrival is 0", async () => {
    mockPrismaWith([
      makeVisit({
        movements: [{ direction: "DEPARTURE", paxCount: 5 }],
      }),
    ]);
    const res = await callGet();
    const body = await res.json();
    const day = body[0];
    expect(day.paxArrival).toBe(0);
    expect(day.paxDeparture).toBe(5);
  });

  it("multiple visits on the same day: sums correctly by direction", async () => {
    // Visit A: turnaround 3/3. Visit B: arrival-only 2.
    mockPrismaWith([
      makeVisit({
        palmaDay: new Date("2026-05-24T00:00:00.000Z"),
        movements: [
          { direction: "ARRIVAL", paxCount: 3 },
          { direction: "DEPARTURE", paxCount: 3 },
        ],
      }),
      makeVisit({
        palmaDay: new Date("2026-05-24T00:00:00.000Z"),
        movements: [{ direction: "ARRIVAL", paxCount: 2 }],
      }),
    ]);
    const res = await callGet();
    const body = await res.json();
    const day = body[0];
    expect(day.paxArrival).toBe(5);   // 3 + 2
    expect(day.paxDeparture).toBe(3); // 3 + 0
    expect(day.totalPax).toBeUndefined();
  });
});
