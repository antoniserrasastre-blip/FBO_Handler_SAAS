/**
 * Tests for src/lib/v2/upsert.ts and src/lib/v2/resolveImportState.ts
 *
 * Tests now assert the CORRECT (post-fix) behaviour.  Where the original
 * characterisation tests documented a bug with a [BUG] tag the new assertions
 * reflect the fixed policy:
 *   - aircraftType is a PLAN field and is always updated on re-import (BUG-4 fix).
 *   - upsertMovement update clause contains only PLAN fields; operational fields
 *     (state, paxCount, parking, …) are excluded so handler edits survive
 *     re-imports (BUG-1 fix).
 *   - upsertVisit / upsertMovement return { record, wasCreated } for accurate
 *     EventLog labelling (BUG-6 fix).
 *   - resolveImportState is a pure function with independent unit tests
 *     (BUG-2 + BUG-3 fix).
 *
 * Strategy: every function in upsert.ts imports `prisma` from "@/lib/db".
 * We use vi.doMock to inject a fake prisma before each dynamic import of the
 * module under test, mirroring the pattern in route.test.ts and
 * daysheets/route.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A minimal aircraft row as returned by Prisma. */
function makeAircraft(overrides: Record<string, unknown> = {}) {
  return {
    id: "ac-1",
    registration: "CS-DXX",
    aircraftType: null,
    currentOperatorId: null,
    createdAt: new Date("2025-06-01T00:00:00.000Z"),
    updatedAt: new Date("2025-06-01T00:00:00.000Z"),
    ...overrides,
  };
}

/** A minimal visit row as returned by Prisma. */
function makeVisit(overrides: Record<string, unknown> = {}) {
  const ts = new Date("2025-06-12T00:00:00.000Z");
  return {
    id: "v-1",
    aircraftId: "ac-1",
    operatorId: null,
    palmaDay: ts,
    type: null,
    arrivalDate: null,
    departureDate: null,
    notes: null,
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  };
}

/** A minimal movement row as returned by Prisma. */
function makeMovement(overrides: Record<string, unknown> = {}) {
  return {
    id: "m-1",
    visitId: "v-1",
    direction: "ARRIVAL",
    callsign: "NJE721CK",
    scheduledDate: new Date("2025-06-12T00:00:00.000Z"),
    state: "EXPECTED",
    createdAt: new Date("2025-06-12T00:00:00.000Z"),
    updatedAt: new Date("2025-06-12T00:00:00.000Z"),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// upsertAircraft
// ---------------------------------------------------------------------------

describe("upsertAircraft — idempotence", () => {
  let mockFindUnique: ReturnType<typeof vi.fn>;
  let mockUpdate: ReturnType<typeof vi.fn>;
  let mockCreate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    mockFindUnique = vi.fn();
    mockUpdate = vi.fn();
    mockCreate = vi.fn();

    vi.doMock("@/lib/db", () => ({
      prisma: {
        aircraft: {
          findUnique: mockFindUnique,
          update: mockUpdate,
          create: mockCreate,
        },
        operator: { upsert: vi.fn(async () => ({ id: "op-1", icaoCode: "NJE", name: "NetJets Europe" })) },
      },
    }));

    // findOperator is a pure function (no DB), imported normally — no mock needed.
  });

  afterEach(() => {
    vi.doUnmock("@/lib/db");
  });

  it("creates a new aircraft when the registration is unknown", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue(makeAircraft());

    const { upsertAircraft } = await import("./upsert");
    const result = await upsertAircraft({ registration: "CS-DXX", aircraftType: "GLEX" });

    expect(mockCreate).toHaveBeenCalledOnce();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(result.id).toBe("ac-1");
  });

  it("returns the existing aircraft without calling create or update when it already exists and aircraftType is already set", async () => {
    const existing = makeAircraft({ aircraftType: "GLEX" });
    mockFindUnique.mockResolvedValue(existing);

    const { upsertAircraft } = await import("./upsert");
    const result = await upsertAircraft({ registration: "CS-DXX", aircraftType: "GLEX" });

    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(result).toBe(existing);
  });

  it("backfills aircraftType via update when existing record has no type", async () => {
    const existing = makeAircraft({ aircraftType: null });
    mockFindUnique.mockResolvedValue(existing);
    const updated = makeAircraft({ aircraftType: "GLEX" });
    mockUpdate.mockResolvedValue(updated);

    const { upsertAircraft } = await import("./upsert");
    const result = await upsertAircraft({ registration: "CS-DXX", aircraftType: "GLEX" });

    expect(mockUpdate).toHaveBeenCalledOnce();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(result.aircraftType).toBe("GLEX");
  });

  it(
    // BUG-4 FIX: aircraftType is a PLAN field and must be updated on re-import
    // when the PDF brings a different type.  The old backfill-only condition
    // (`!existing.aircraftType`) has been replaced with a change-detection check
    // (`existing.aircraftType !== args.aircraftType`).
    "updates aircraftType when the PDF brings a different type (plan field — always current)",
    async () => {
      const existing = makeAircraft({ aircraftType: "GLEX" });
      mockFindUnique.mockResolvedValue(existing);
      const updated = makeAircraft({ aircraftType: "G700" });
      mockUpdate.mockResolvedValue(updated);

      const { upsertAircraft } = await import("./upsert");
      const result = await upsertAircraft({ registration: "CS-DXX", aircraftType: "G700" });

      // Correct behaviour: update IS called with the new type
      expect(mockUpdate).toHaveBeenCalledOnce();
      expect(result.aircraftType).toBe("G700");
    }
  );

  it("normalises registration to uppercase before lookup", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue(makeAircraft({ registration: "CS-DXX" }));

    const { upsertAircraft } = await import("./upsert");
    await upsertAircraft({ registration: "cs-dxx" });

    expect(mockFindUnique).toHaveBeenCalledWith({ where: { registration: "CS-DXX" } });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ registration: "CS-DXX" }) })
    );
  });
});

// ---------------------------------------------------------------------------
// upsertOperator
// ---------------------------------------------------------------------------

describe("upsertOperator — idempotence", () => {
  let mockUpsert: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    mockUpsert = vi.fn(async () => ({ id: "op-1", icaoCode: "NJE", name: "NetJets Europe" }));

    vi.doMock("@/lib/db", () => ({
      prisma: { operator: { upsert: mockUpsert } },
    }));
  });

  afterEach(() => {
    vi.doUnmock("@/lib/db");
  });

  it("delegates to prisma.operator.upsert so the DB layer handles find-or-create", async () => {
    const { upsertOperator } = await import("./upsert");
    const result = await upsertOperator("NJE", "NetJets Europe");

    expect(mockUpsert).toHaveBeenCalledOnce();
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { icaoCode: "NJE" },
      create: { icaoCode: "NJE", name: "NetJets Europe" },
      update: { name: "NetJets Europe" },
    });
    expect(result.id).toBe("op-1");
  });

  it("normalises icaoCode to uppercase", async () => {
    const { upsertOperator } = await import("./upsert");
    await upsertOperator("nje", "NetJets Europe");

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { icaoCode: "NJE" } })
    );
  });

  it(
    // NOTE: operator name update-on-reimport is retained as-is (low priority, no UI
    // to edit operator names currently).  Documented here for awareness.
    "always updates operator name on re-import (note: no UI to edit names yet, low risk)",
    async () => {
      const { upsertOperator } = await import("./upsert");
      await upsertOperator("NJE", "NetJets Europe (corrected)");

      const call = mockUpsert.mock.calls[0][0];
      expect(call.update).toEqual({ name: "NetJets Europe (corrected)" });
    }
  );
});

// ---------------------------------------------------------------------------
// upsertVisit
// ---------------------------------------------------------------------------

describe("upsertVisit — idempotence", () => {
  let mockFindFirst: ReturnType<typeof vi.fn>;
  let mockUpdate: ReturnType<typeof vi.fn>;
  let mockCreate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    mockFindFirst = vi.fn();
    mockUpdate = vi.fn();
    mockCreate = vi.fn();

    vi.doMock("@/lib/db", () => ({
      prisma: {
        visit: {
          findFirst: mockFindFirst,
          update: mockUpdate,
          create: mockCreate,
        },
      },
    }));
  });

  afterEach(() => {
    vi.doUnmock("@/lib/db");
  });

  it("creates a new visit when none exists for that aircraft+day and returns wasCreated=true", async () => {
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue(makeVisit());

    const { upsertVisit } = await import("./upsert");
    const result = await upsertVisit({
      aircraftId: "ac-1",
      palmaDay: "2025-06-12",
      operatorId: "op-1",
    });

    expect(mockCreate).toHaveBeenCalledOnce();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(result.record.id).toBe("v-1");
    expect(result.wasCreated).toBe(true);
  });

  it("returns the existing visit with wasCreated=false when it already exists and operatorId is already set", async () => {
    const existing = makeVisit({ operatorId: "op-1" });
    mockFindFirst.mockResolvedValue(existing);

    const { upsertVisit } = await import("./upsert");
    const result = await upsertVisit({
      aircraftId: "ac-1",
      palmaDay: "2025-06-12",
      operatorId: "op-1",
    });

    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(result.record).toBe(existing);
    expect(result.wasCreated).toBe(false);
  });

  it("backfills operatorId via update when existing visit has no operator and returns wasCreated=false", async () => {
    const existing = makeVisit({ operatorId: null });
    mockFindFirst.mockResolvedValue(existing);
    const updated = makeVisit({ operatorId: "op-1" });
    mockUpdate.mockResolvedValue(updated);

    const { upsertVisit } = await import("./upsert");
    const result = await upsertVisit({
      aircraftId: "ac-1",
      palmaDay: "2025-06-12",
      operatorId: "op-1",
    });

    expect(mockUpdate).toHaveBeenCalledOnce();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(result.record.operatorId).toBe("op-1");
    expect(result.wasCreated).toBe(false);
  });

  it(
    // operatorId update on re-import with different operator is deferred (low priority).
    // Documented here as a known limitation — separate increment.
    "does NOT update operatorId when the existing visit already has one (backfill-only, not overwrite — known limitation)",
    async () => {
      const existing = makeVisit({ operatorId: "op-old" });
      mockFindFirst.mockResolvedValue(existing);

      const { upsertVisit } = await import("./upsert");
      const result = await upsertVisit({
        aircraftId: "ac-1",
        palmaDay: "2025-06-12",
        operatorId: "op-new",
      });

      expect(mockUpdate).not.toHaveBeenCalled();
      expect(result.record.operatorId).toBe("op-old");
      expect(result.wasCreated).toBe(false);
    }
  );

  it("accepts a Date object for palmaDay as well as a string", async () => {
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue(makeVisit());

    const { upsertVisit } = await import("./upsert");
    await upsertVisit({
      aircraftId: "ac-1",
      palmaDay: new Date("2025-06-12T00:00:00.000Z"),
    });

    // findFirst must be called with the exact UTC midnight Date
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: {
        aircraftId: "ac-1",
        palmaDay: new Date("2025-06-12T00:00:00.000Z"),
      },
    });
  });

  it(
    // [DESIGN NOTE] upsertVisit uses findFirst (not findUnique) keyed on
    // (aircraftId, palmaDay). There is NO database-level unique constraint on
    // this pair (only @@index). Therefore a race condition between two
    // concurrent imports of the same aircraft+day can create duplicate visits.
    // A @@unique([aircraftId, palmaDay]) is NOT an option since the double-
    // rotation fix (18-07-2026): several visits per aircraft+day are legal.
    // Serialising concurrent imports would be a separate increment.
    "uses findFirst not findUnique — no DB-level uniqueness on aircraftId+palmaDay (race condition risk documented)",
    async () => {
      mockFindFirst.mockResolvedValue(null);
      mockCreate.mockResolvedValue(makeVisit());

      const { upsertVisit } = await import("./upsert");
      await upsertVisit({ aircraftId: "ac-1", palmaDay: "2025-06-12" });

      // Current behaviour: findFirst is used (not findUnique)
      expect(mockFindFirst).toHaveBeenCalled();
    }
  );
});

// ---------------------------------------------------------------------------
// upsertVisit — double rotations (match by callsign + hora, 18-07-2026 fix)
// ---------------------------------------------------------------------------

describe("upsertVisit — rotation matching (callsign + hora)", () => {
  let mockFindFirst: ReturnType<typeof vi.fn>;
  let mockFindMany: ReturnType<typeof vi.fn>;
  let mockUpdate: ReturnType<typeof vi.fn>;
  let mockCreate: ReturnType<typeof vi.fn>;

  /** A visit as returned by findMany with the movements include. */
  function makeVisitWithMovements(
    id: string,
    movements: Array<Record<string, unknown>>,
    overrides: Record<string, unknown> = {}
  ) {
    return {
      ...makeVisit({ id, ...overrides }),
      movements: movements.map((m) => ({ eta: null, etd: null, ...m })),
    };
  }

  beforeEach(() => {
    vi.resetModules();
    mockFindFirst = vi.fn();
    mockFindMany = vi.fn();
    mockUpdate = vi.fn();
    mockCreate = vi.fn();

    vi.doMock("@/lib/db", () => ({
      prisma: {
        visit: {
          findFirst: mockFindFirst,
          findMany: mockFindMany,
          update: mockUpdate,
          create: mockCreate,
        },
      },
    }));
  });

  afterEach(() => {
    vi.doUnmock("@/lib/db");
  });

  it("without a match hint keeps the legacy findFirst path (enrichment callers)", async () => {
    mockFindFirst.mockResolvedValue(makeVisit({ operatorId: "op-1" }));

    const { upsertVisit } = await import("./upsert");
    await upsertVisit({ aircraftId: "ac-1", palmaDay: "2025-06-12" });

    expect(mockFindFirst).toHaveBeenCalledOnce();
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("with a hint and no visits that day, creates one (wasCreated=true)", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCreate.mockResolvedValue(makeVisit());

    const { upsertVisit } = await import("./upsert");
    const result = await upsertVisit({
      aircraftId: "ac-1",
      palmaDay: "2025-06-12",
      match: { callsigns: ["NJE721CK"], eta: "12:00" },
    });

    expect(mockFindFirst).not.toHaveBeenCalled();
    expect(result.wasCreated).toBe(true);
  });

  it("matches the visit that shares a callsign (normal re-import) and strips movements from the record", async () => {
    const v1 = makeVisitWithMovements("v-1", [
      { direction: "ARRIVAL", callsign: "ASH101", eta: "08:00" },
      { direction: "DEPARTURE", callsign: "ASH102", etd: "10:00" },
    ], { operatorId: "op-1" });
    mockFindMany.mockResolvedValue([v1]);

    const { upsertVisit } = await import("./upsert");
    const result = await upsertVisit({
      aircraftId: "ac-1",
      palmaDay: "2025-06-12",
      match: { callsigns: ["ash102"], eta: "18:00", etd: "20:00" },
    });

    expect(mockCreate).not.toHaveBeenCalled();
    expect(result.record.id).toBe("v-1");
    expect(result.wasCreated).toBe(false);
    expect("movements" in result.record).toBe(false);
  });

  it("matches by hora within tolerance when the callsign was corrected (errata)", async () => {
    const v1 = makeVisitWithMovements("v-1", [
      { direction: "ARRIVAL", callsign: "ASH101", eta: "08:00" },
      { direction: "DEPARTURE", callsign: "ASH102", etd: "10:00" },
    ], { operatorId: "op-1" });
    mockFindMany.mockResolvedValue([v1]);

    const { upsertVisit } = await import("./upsert");
    const result = await upsertVisit({
      aircraftId: "ac-1",
      palmaDay: "2025-06-12",
      // Corrected callsigns, times slid 30 min — same rotation.
      match: { callsigns: ["ASH201", "ASH202"], eta: "08:30", etd: "10:30" },
    });

    expect(mockCreate).not.toHaveBeenCalled();
    expect(result.record.id).toBe("v-1");
  });

  it("creates a SECOND visit for a second rotation of the same day (D-ASIM regression)", async () => {
    // Rotation 1 already imported: arrival 06:55, departure 09:30.
    const v1 = makeVisitWithMovements("v-1", [
      { direction: "ARRIVAL", callsign: "ASH101", eta: "06:55" },
      { direction: "DEPARTURE", callsign: "ASH102", etd: "09:30" },
    ], { operatorId: "op-1" });
    mockFindMany.mockResolvedValue([v1]);
    mockCreate.mockResolvedValue(makeVisit({ id: "v-2" }));

    const { upsertVisit } = await import("./upsert");
    // Rotation 2 of the same aircraft: different callsigns, hours apart.
    const result = await upsertVisit({
      aircraftId: "ac-1",
      palmaDay: "2025-06-12",
      match: { callsigns: ["ASH201", "ASH202"], eta: "12:42", etd: "14:30" },
    });

    expect(mockCreate).toHaveBeenCalledOnce();
    expect(result.record.id).toBe("v-2");
    expect(result.wasCreated).toBe(true);
  });

  it("never merges into a visit already claimed by a sibling row (excludeVisitIds), even with the same callsign", async () => {
    const v1 = makeVisitWithMovements("v-1", [
      { direction: "ARRIVAL", callsign: "SHT100", eta: "07:00" },
      { direction: "DEPARTURE", callsign: "SHT100", etd: "09:00" },
    ], { operatorId: "op-1" });
    mockFindMany.mockResolvedValue([v1]);
    mockCreate.mockResolvedValue(makeVisit({ id: "v-2" }));

    const { upsertVisit } = await import("./upsert");
    const result = await upsertVisit({
      aircraftId: "ac-1",
      palmaDay: "2025-06-12",
      match: { callsigns: ["SHT100"], eta: "13:00", etd: "15:00", excludeVisitIds: ["v-1"] },
    });

    expect(mockCreate).toHaveBeenCalledOnce();
    expect(result.record.id).toBe("v-2");
    expect(result.wasCreated).toBe(true);
  });

  it("picks the CLOSEST visit when several fall within tolerance", async () => {
    const v1 = makeVisitWithMovements("v-1", [
      { direction: "DEPARTURE", callsign: "ASH102", etd: "10:00" },
    ], { operatorId: "op-1" });
    const v2 = makeVisitWithMovements("v-2", [
      { direction: "DEPARTURE", callsign: "ASH202", etd: "11:00" },
    ], { operatorId: "op-1" });
    mockFindMany.mockResolvedValue([v1, v2]);

    const { upsertVisit } = await import("./upsert");
    const result = await upsertVisit({
      aircraftId: "ac-1",
      palmaDay: "2025-06-12",
      match: { callsigns: ["ASH999"], etd: "10:50" },
    });

    expect(result.record.id).toBe("v-2");
  });

  it("treats times as wrapping around midnight (23:50 vs 00:20 = 30 min apart)", async () => {
    const v1 = makeVisitWithMovements("v-1", [
      { direction: "DEPARTURE", callsign: "ASH102", etd: "23:50" },
    ], { operatorId: "op-1" });
    mockFindMany.mockResolvedValue([v1]);

    const { upsertVisit } = await import("./upsert");
    const result = await upsertVisit({
      aircraftId: "ac-1",
      palmaDay: "2025-06-12",
      match: { callsigns: ["ASH999"], etd: "00:20" },
    });

    expect(mockCreate).not.toHaveBeenCalled();
    expect(result.record.id).toBe("v-1");
  });
});

// ---------------------------------------------------------------------------
// upsertMovement
// ---------------------------------------------------------------------------

describe("upsertMovement — idempotence and plan/operational field split", () => {
  let mockFindUnique: ReturnType<typeof vi.fn>;
  let mockUpsert: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    mockUpsert = vi.fn(async () => makeMovement());
    mockFindUnique = vi.fn(async () => null); // default: new movement (create path)

    vi.doMock("@/lib/db", () => ({
      prisma: {
        movement: { upsert: mockUpsert, findUnique: mockFindUnique },
      },
    }));
  });

  afterEach(() => {
    vi.doUnmock("@/lib/db");
  });

  it("delegates to prisma.movement.upsert keyed on visitId_direction", async () => {
    const { upsertMovement } = await import("./upsert");
    await upsertMovement({
      visitId: "v-1",
      direction: "ARRIVAL",
      callsign: "NJE721CK",
      scheduledDate: "2025-06-12",
    });

    expect(mockUpsert).toHaveBeenCalledOnce();
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { visitId_direction: { visitId: "v-1", direction: "ARRIVAL" } },
      })
    );
  });

  it("passes plan fields to both create and update clauses; operational fields only to create", async () => {
    const { upsertMovement } = await import("./upsert");
    await upsertMovement({
      visitId: "v-1",
      direction: "ARRIVAL",
      callsign: "NJE721CK",
      scheduledDate: "2025-06-12",
      data: { origin: "EGLL", eta: "09:30", state: "PARKED", paxCount: 5, parking: "T3-A" },
    });

    const call = mockUpsert.mock.calls[0][0];

    // Plan fields appear in both create and update
    expect(call.create).toMatchObject({ origin: "EGLL", eta: "09:30" });
    expect(call.update).toMatchObject({ origin: "EGLL", eta: "09:30" });

    // Operational fields appear ONLY in create
    expect(call.create).toMatchObject({ state: "PARKED", paxCount: 5, parking: "T3-A" });
    expect(call.update).not.toHaveProperty("state");
    expect(call.update).not.toHaveProperty("paxCount");
    expect(call.update).not.toHaveProperty("parking");
  });

  it(
    // BUG-1 FIX: re-import must NOT overwrite handler-edited operational fields.
    // The update clause now contains only PLAN fields — state/paxCount/parking
    // set by the handler survive re-imports.
    "re-import does NOT overwrite operational fields (state, paxCount, parking) — BUG-1 fix",
    async () => {
      // Simulate an existing movement (update path)
      mockFindUnique.mockResolvedValue({ id: "m-1" });

      const { upsertMovement } = await import("./upsert");
      await upsertMovement({
        visitId: "v-1",
        direction: "ARRIVAL",
        callsign: "NJE721CK",
        scheduledDate: "2025-06-12",
        data: {
          state: "EXPECTED",  // from PDF
          paxCount: 4,
          parking: "T3-A",
          origin: "EGLL",
          eta: "10:00",
        },
      });

      const call = mockUpsert.mock.calls[0][0];
      // update clause must NOT contain operational fields
      expect(call.update).not.toHaveProperty("state");
      expect(call.update).not.toHaveProperty("paxCount");
      expect(call.update).not.toHaveProperty("parking");
      // plan fields ARE in the update clause
      expect(call.update).toMatchObject({ callsign: "NJE721CK", origin: "EGLL", eta: "10:00" });
    }
  );

  it("returns wasCreated=true when the movement did not exist before", async () => {
    mockFindUnique.mockResolvedValue(null); // no existing movement
    mockUpsert.mockResolvedValue(makeMovement());

    const { upsertMovement } = await import("./upsert");
    const result = await upsertMovement({
      visitId: "v-1",
      direction: "ARRIVAL",
      callsign: "NJE721CK",
      scheduledDate: "2025-06-12",
    });

    expect(result.wasCreated).toBe(true);
  });

  it("returns wasCreated=false when the movement already existed (re-import path)", async () => {
    mockFindUnique.mockResolvedValue({ id: "m-1" }); // existing movement found
    mockUpsert.mockResolvedValue(makeMovement());

    const { upsertMovement } = await import("./upsert");
    const result = await upsertMovement({
      visitId: "v-1",
      direction: "ARRIVAL",
      callsign: "NJE721CK",
      scheduledDate: "2025-06-12",
    });

    expect(result.wasCreated).toBe(false);
  });

  it("uses a string scheduledDate by converting it via palmaDayUtc", async () => {
    const { upsertMovement } = await import("./upsert");
    await upsertMovement({
      visitId: "v-1",
      direction: "ARRIVAL",
      callsign: "NJE721CK",
      scheduledDate: "2025-06-12",
    });

    const call = mockUpsert.mock.calls[0][0];
    const expectedDate = new Date("2025-06-12T00:00:00.000Z");
    expect(call.create.scheduledDate).toEqual(expectedDate);
    expect(call.update.scheduledDate).toEqual(expectedDate);
  });
});

// ---------------------------------------------------------------------------
// resolveImportState — pure function unit tests (BUG-2 + BUG-3 fix)
//
// These tests exercise the extracted pure helper directly without any HTTP
// or Prisma machinery.
// ---------------------------------------------------------------------------

describe("resolveImportState — pure state/date derivation", () => {
  // Import the real function — it has no side effects.
  // We use a static import here because there is no Prisma dependency.

  it("turnaround (same day arrival and departure) → arrivalState EXPECTED, departureState EXPECTED, type TURNAROUND", async () => {
    const { resolveImportState } = await import("./resolveImportState");
    const targetDate = new Date("2025-06-12T00:00:00.000Z");
    const result = resolveImportState("12/06/25", "12/06/25", targetDate);

    expect(result.arrivalState).toBe("EXPECTED");
    expect(result.departureState).toBe("EXPECTED");
    expect(result.visitType).toBe("TURNAROUND");
    expect(result.isOvernight).toBe(false);
    expect(result.visitDay).toEqual(new Date("2025-06-12T00:00:00.000Z"));
  });

  it("no explicit dates (both undefined) → EXPECTED/EXPECTED, TURNAROUND, visitDay = targetDate", async () => {
    const { resolveImportState } = await import("./resolveImportState");
    const targetDate = new Date("2025-06-12T00:00:00.000Z");
    const result = resolveImportState(undefined, undefined, targetDate);

    expect(result.arrivalState).toBe("EXPECTED");
    expect(result.departureState).toBe("EXPECTED");
    expect(result.visitType).toBe("TURNAROUND");
    expect(result.isOvernight).toBe(false);
    expect(result.visitDay).toEqual(new Date("2025-06-12T00:00:00.000Z"));
  });

  it(
    // Pernocta: aircraft arrived yesterday, sheet is for today (departure day).
    // arrivalState = PARKED (already on ground), departureState = EXPECTED (not departed yet).
    "pernocta: arrDate < targetDate → arrivalState PARKED, departureState EXPECTED, type OVERNIGHT, visitDay = arrival day",
    async () => {
      const { resolveImportState } = await import("./resolveImportState");
      // Aircraft arrived 11 Jun, departs 12 Jun. Sheet is for 12 Jun.
      const targetDate = new Date("2025-06-12T00:00:00.000Z");
      const result = resolveImportState("11/06/25", "12/06/25", targetDate);

      expect(result.isOvernight).toBe(true);
      expect(result.arrivalState).toBe("PARKED");
      // BUG-2 FIX: departure was also PARKED before fix; now always EXPECTED
      expect(result.departureState).toBe("EXPECTED");
      expect(result.visitType).toBe("OVERNIGHT");
      // visitDay anchored to arrival day
      expect(result.visitDay).toEqual(new Date("2025-06-11T00:00:00.000Z"));
    }
  );

  it("pernocta: arrDate == targetDate (arrives today, departs tomorrow) → arrivalState EXPECTED, departureState EXPECTED", async () => {
    const { resolveImportState } = await import("./resolveImportState");
    // Aircraft arrives today (12 Jun) and departs tomorrow (13 Jun).
    // isOvernight=true, but arrDate is NOT < targetDate → EXPECTED for arrival.
    const targetDate = new Date("2025-06-12T00:00:00.000Z");
    const result = resolveImportState("12/06/25", "13/06/25", targetDate);

    expect(result.isOvernight).toBe(true);
    expect(result.arrivalState).toBe("EXPECTED");
    expect(result.departureState).toBe("EXPECTED");
    expect(result.visitType).toBe("OVERNIGHT");
    expect(result.visitDay).toEqual(new Date("2025-06-12T00:00:00.000Z"));
  });

  it("multi-night: arrived 2 days ago → arrivalState PARKED, departureState EXPECTED (correct behaviour)", async () => {
    const { resolveImportState } = await import("./resolveImportState");
    const targetDate = new Date("2025-06-12T00:00:00.000Z");
    const result = resolveImportState("10/06/25", "12/06/25", targetDate);

    expect(result.arrivalState).toBe("PARKED");
    expect(result.departureState).toBe("EXPECTED");
    expect(result.visitDay).toEqual(new Date("2025-06-10T00:00:00.000Z"));
  });

  it("visitDay is always the arrival day (departure day sheet may miss overnight departures — documented limitation)", async () => {
    const { resolveImportState } = await import("./resolveImportState");
    // arr 11 Jun, dep 12 Jun, sheet is 12 Jun
    const targetDate = new Date("2025-06-12T00:00:00.000Z");
    const result = resolveImportState("11/06/25", "12/06/25", targetDate);
    // visitDay is the arrival day — 11 Jun
    expect(result.visitDay).toEqual(new Date("2025-06-11T00:00:00.000Z"));
  });
});

// ---------------------------------------------------------------------------
// wasCreated — accurate EventLog labelling (BUG-6 fix)
//
// After the fix, upsertVisit returns { record, wasCreated } instead of relying
// on the createdAt vs updatedAt timestamp heuristic, which gave false positives
// when a backfill update was triggered in the same import run.
// ---------------------------------------------------------------------------

describe("wasCreated flag — BUG-6 fix", () => {
  let mockFindFirst: ReturnType<typeof vi.fn>;
  let mockUpdate: ReturnType<typeof vi.fn>;
  let mockCreate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    mockFindFirst = vi.fn();
    mockUpdate = vi.fn();
    mockCreate = vi.fn();

    vi.doMock("@/lib/db", () => ({
      prisma: {
        visit: {
          findFirst: mockFindFirst,
          update: mockUpdate,
          create: mockCreate,
        },
      },
    }));
  });

  afterEach(() => {
    vi.doUnmock("@/lib/db");
  });

  it("first import: wasCreated=true — no timestamp heuristic needed", async () => {
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue(makeVisit());

    const { upsertVisit } = await import("./upsert");
    const { wasCreated } = await upsertVisit({ aircraftId: "ac-1", palmaDay: "2025-06-12" });

    expect(wasCreated).toBe(true);
  });

  it("re-import (visit already exists, no backfill): wasCreated=false", async () => {
    const ts = new Date("2025-06-12T10:00:00.000Z");
    const laterTs = new Date("2025-06-12T11:00:00.000Z");
    // Even if updatedAt > createdAt (old heuristic would say isUpdate=true), result is still false
    const existing = makeVisit({ createdAt: ts, updatedAt: laterTs, operatorId: "op-1" });
    mockFindFirst.mockResolvedValue(existing);

    const { upsertVisit } = await import("./upsert");
    const { wasCreated } = await upsertVisit({ aircraftId: "ac-1", palmaDay: "2025-06-12", operatorId: "op-1" });

    expect(wasCreated).toBe(false);
  });

  it("backfill operatorId on existing visit: wasCreated=false even though update() is called", async () => {
    // Old heuristic bug: after backfill update, updatedAt was bumped → isUpdate=true even on first meaningful import.
    // wasCreated flag is stable regardless of the backfill.
    const existing = makeVisit({ operatorId: null });
    mockFindFirst.mockResolvedValue(existing);
    const updated = makeVisit({ operatorId: "op-1" });
    mockUpdate.mockResolvedValue(updated);

    const { upsertVisit } = await import("./upsert");
    const { wasCreated } = await upsertVisit({ aircraftId: "ac-1", palmaDay: "2025-06-12", operatorId: "op-1" });

    expect(mockUpdate).toHaveBeenCalledOnce();
    // Critical: wasCreated is false even though update() fired (it was a backfill, not a create)
    expect(wasCreated).toBe(false);
  });
});
