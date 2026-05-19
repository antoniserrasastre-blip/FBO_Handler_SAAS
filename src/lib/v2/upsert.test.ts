import { describe, it, expect, beforeEach, vi } from "vitest";

// The matching logic in upsertVisit is the hard part — two same-day visits
// for the same aircraft must coexist. We exercise it against a hand-rolled
// prisma double that records the where clauses it was asked about.

interface FakeVisit {
  id: string;
  aircraftId: string;
  palmaDay: Date;
  operatorId: string | null;
  source: string;
  movements: { callsign: string }[];
}

const palmaDayFor20250612 = new Date("2025-06-12T00:00:00.000Z");

function makeFakePrisma(visits: FakeVisit[]) {
  const created: FakeVisit[] = [];
  return {
    visits,
    created,
    visit: {
      async findFirst(args: {
        where: {
          aircraftId: string;
          palmaDay: Date;
          movements?: { some?: { callsign: string }; none?: Record<string, never> };
        };
      }) {
        const candidates = visits.filter(
          (v) =>
            v.aircraftId === args.where.aircraftId &&
            v.palmaDay.getTime() === args.where.palmaDay.getTime(),
        );
        if (args.where.movements?.some) {
          const cs = args.where.movements.some.callsign;
          return candidates.find((v) => v.movements.some((m) => m.callsign === cs)) || null;
        }
        if (args.where.movements?.none) {
          return candidates.find((v) => v.movements.length === 0) || null;
        }
        return candidates[0] || null;
      },
      async update(args: { where: { id: string }; data: Partial<FakeVisit> }) {
        const v = visits.find((x) => x.id === args.where.id);
        if (v) Object.assign(v, args.data);
        return v;
      },
      async create(args: { data: { aircraftId: string; palmaDay: Date; operatorId: string | null; source: string } }) {
        const v: FakeVisit = {
          id: `v-${visits.length + created.length + 1}`,
          aircraftId: args.data.aircraftId,
          palmaDay: args.data.palmaDay,
          operatorId: args.data.operatorId,
          source: args.data.source,
          movements: [],
        };
        created.push(v);
        return v;
      },
    },
  };
}

describe("upsertVisit — same-day multi-visit handling", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("creates two distinct Visits for the same aircraft on the same day when callsigns differ", async () => {
    const fake = makeFakePrisma([
      {
        id: "v-existing",
        aircraftId: "ac-1",
        palmaDay: palmaDayFor20250612,
        operatorId: "op-1",
        source: "PDF",
        movements: [{ callsign: "NJE100" }, { callsign: "NJE101" }],
      },
    ]);
    vi.doMock("@/lib/db", () => ({ prisma: fake }));
    vi.doMock("@/lib/operators", () => ({ findOperator: () => null }));
    const { upsertVisit } = await import("./upsert");

    // Morning turnaround already exists (NJE100/NJE101). New afternoon
    // turnaround (NJE200) arrives — must create a brand-new Visit, not
    // collapse onto the morning one.
    const v = await upsertVisit({
      aircraftId: "ac-1",
      palmaDay: palmaDayFor20250612,
      source: "PDF",
      legCallsign: "NJE200",
    });

    expect(v.id).not.toBe("v-existing");
    expect(fake.created).toHaveLength(1);
    expect(fake.created[0].aircraftId).toBe("ac-1");
  });

  it("reuses the existing Visit when the callsign matches one of its movements", async () => {
    const fake = makeFakePrisma([
      {
        id: "v-existing",
        aircraftId: "ac-1",
        palmaDay: palmaDayFor20250612,
        operatorId: "op-1",
        source: "PDF",
        movements: [{ callsign: "NJE100" }, { callsign: "NJE101" }],
      },
    ]);
    vi.doMock("@/lib/db", () => ({ prisma: fake }));
    vi.doMock("@/lib/operators", () => ({ findOperator: () => null }));
    const { upsertVisit } = await import("./upsert");

    // Re-import: same flight (NJE100). Must reuse v-existing, not create.
    const v = await upsertVisit({
      aircraftId: "ac-1",
      palmaDay: palmaDayFor20250612,
      source: "PDF",
      legCallsign: "NJE100",
    });

    expect(v.id).toBe("v-existing");
    expect(fake.created).toHaveLength(0);
  });

  it("adopts an orphan EXTRAS Visit (no movements) instead of creating a duplicate", async () => {
    const fake = makeFakePrisma([
      {
        id: "v-orphan",
        aircraftId: "ac-1",
        palmaDay: palmaDayFor20250612,
        operatorId: null,
        source: "EXTRAS",
        movements: [], // Excel arrived before PDF — no flight legs yet
      },
    ]);
    vi.doMock("@/lib/db", () => ({ prisma: fake }));
    vi.doMock("@/lib/operators", () => ({ findOperator: () => null }));
    const { upsertVisit } = await import("./upsert");

    // PDF arrives later. The orphan should be adopted so the services
    // attached to it stay linked to the now-confirmed Visit.
    const v = await upsertVisit({
      aircraftId: "ac-1",
      palmaDay: palmaDayFor20250612,
      source: "PDF",
      legCallsign: "NJE100",
    });

    expect(v.id).toBe("v-orphan");
    expect(v.source).toBe("PDF"); // upgrade-only: EXTRAS → PDF
    expect(fake.created).toHaveLength(0);
  });

  it("creates a new Visit when no callsign match and no orphan is available", async () => {
    const fake = makeFakePrisma([]);
    vi.doMock("@/lib/db", () => ({ prisma: fake }));
    vi.doMock("@/lib/operators", () => ({ findOperator: () => null }));
    const { upsertVisit } = await import("./upsert");

    const v = await upsertVisit({
      aircraftId: "ac-1",
      palmaDay: palmaDayFor20250612,
      source: "PDF",
      legCallsign: "NJE100",
    });

    expect(fake.created).toHaveLength(1);
    expect(v.id).toBe(fake.created[0].id);
  });

  it("without legCallsign, falls back to legacy first-match (extras path)", async () => {
    // The extras Excel doesn't know callsigns — it must still find the
    // PDF-sourced Visit for the registration so it can attach services.
    const fake = makeFakePrisma([
      {
        id: "v-existing",
        aircraftId: "ac-1",
        palmaDay: palmaDayFor20250612,
        operatorId: "op-1",
        source: "PDF",
        movements: [{ callsign: "NJE100" }],
      },
    ]);
    vi.doMock("@/lib/db", () => ({ prisma: fake }));
    vi.doMock("@/lib/operators", () => ({ findOperator: () => null }));
    const { upsertVisit } = await import("./upsert");

    const v = await upsertVisit({
      aircraftId: "ac-1",
      palmaDay: palmaDayFor20250612,
      source: "EXTRAS",
    });

    expect(v.id).toBe("v-existing");
    expect(fake.created).toHaveLength(0);
  });
});
