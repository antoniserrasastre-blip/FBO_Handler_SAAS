/**
 * crewItemMigration.test.ts
 *
 * Tests for the pure mapping layer (crewItemToService) and the catalogue
 * invariant (all CrewItem types exist in the unified Service catalogue).
 *
 * DB-touching code (migrateCrewItemsToServices) is tested via a mock so the
 * suite stays fast and deterministic.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  crewItemToService,
  crewItemServiceId,
  type CrewItemRecord,
} from "@/lib/crewItemMigration";
import { CREW_ITEM_TYPES } from "@/types";
import { SERVICE_TYPES } from "@/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCrewItem(overrides: Partial<CrewItemRecord> = {}): CrewItemRecord {
  return {
    id: "ci_test_001",
    visitId: "visit_abc",
    type: "THERMOS",
    customName: null,
    quantity: 2,
    state: "STORED",
    notes: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Catalogue invariant
// ---------------------------------------------------------------------------

describe("Unified service catalogue — all CrewItem types are valid ServiceTypes", () => {
  it("every CREW_ITEM_TYPE exists in SERVICE_TYPES", () => {
    const serviceSet = new Set(SERVICE_TYPES as readonly string[]);
    for (const crewType of CREW_ITEM_TYPES) {
      expect(
        serviceSet.has(crewType),
        `CrewItemType "${crewType}" is missing from SERVICE_TYPES`
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// crewItemServiceId
// ---------------------------------------------------------------------------

describe("crewItemServiceId", () => {
  it("returns deterministic id prefixed with ci_", () => {
    expect(crewItemServiceId("abc123")).toBe("ci_abc123");
    expect(crewItemServiceId("xyz")).toBe("ci_xyz");
  });

  it("produces the same result every time (idempotent)", () => {
    const id = "some_cuid";
    expect(crewItemServiceId(id)).toBe(crewItemServiceId(id));
  });
});

// ---------------------------------------------------------------------------
// crewItemToService — state mapping
// ---------------------------------------------------------------------------

describe("crewItemToService — state mapping", () => {
  it("maps STORED → PENDING", () => {
    const item = makeCrewItem({ state: "STORED" });
    const svc = crewItemToService(item);
    expect(svc.state).toBe("PENDING");
  });

  it("maps RETURNED → DELIVERED", () => {
    const item = makeCrewItem({ state: "RETURNED" });
    const svc = crewItemToService(item);
    expect(svc.state).toBe("DELIVERED");
  });

  it("maps unknown states to PENDING (safe default)", () => {
    const item = makeCrewItem({ state: "WHATEVER" });
    const svc = crewItemToService(item);
    expect(svc.state).toBe("PENDING");
  });
});

// ---------------------------------------------------------------------------
// crewItemToService — fixed fields
// ---------------------------------------------------------------------------

describe("crewItemToService — fixed fields", () => {
  it("sets direction = BOTH", () => {
    const svc = crewItemToService(makeCrewItem());
    expect(svc.direction).toBe("BOTH");
  });

  it("sets origin = CREW", () => {
    const svc = crewItemToService(makeCrewItem());
    expect(svc.origin).toBe("CREW");
  });

  it("sets target = CREW", () => {
    const svc = crewItemToService(makeCrewItem());
    expect(svc.target).toBe("CREW");
  });

  it("uses the deterministic id derived from crewItemId", () => {
    const item = makeCrewItem({ id: "ci_test_001" });
    const svc = crewItemToService(item);
    expect(svc.id).toBe("ci_ci_test_001");
  });
});

// ---------------------------------------------------------------------------
// crewItemToService — passthrough fields
// ---------------------------------------------------------------------------

describe("crewItemToService — passthrough fields", () => {
  it("preserves type", () => {
    const svc = crewItemToService(makeCrewItem({ type: "COOLER_BAG" }));
    expect(svc.type).toBe("COOLER_BAG");
  });

  it("preserves customName", () => {
    const svc = crewItemToService(
      makeCrewItem({ type: "CUSTOM", customName: "Bolsa roja" })
    );
    expect(svc.customName).toBe("Bolsa roja");
  });

  it("preserves quantity", () => {
    const svc = crewItemToService(makeCrewItem({ quantity: 3 }));
    expect(svc.quantity).toBe(3);
  });

  it("preserves visitId", () => {
    const svc = crewItemToService(makeCrewItem({ visitId: "v_special" }));
    expect(svc.visitId).toBe("v_special");
  });

  it("maps notes → rawDescription for audit trail", () => {
    const svc = crewItemToService(
      makeCrewItem({ notes: "Cuidado, está roto" })
    );
    expect(svc.rawDescription).toBe("Cuidado, está roto");
  });

  it("rawDescription is null when notes is null", () => {
    const svc = crewItemToService(makeCrewItem({ notes: null }));
    expect(svc.rawDescription).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// crewItemToService — every CrewItemType round-trips correctly
// ---------------------------------------------------------------------------

describe("crewItemToService — all CrewItemTypes produce valid output", () => {
  for (const type of CREW_ITEM_TYPES) {
    it(`type "${type}" maps to a valid Service shape`, () => {
      const item = makeCrewItem({ type });
      const svc = crewItemToService(item);
      expect(svc.type).toBe(type);
      expect(svc.direction).toBe("BOTH");
      expect(svc.origin).toBe("CREW");
      expect(typeof svc.id).toBe("string");
      expect(svc.id.length).toBeGreaterThan(0);
    });
  }
});

// ---------------------------------------------------------------------------
// migrateCrewItemsToServices — idempotency via mocked DB
// ---------------------------------------------------------------------------

describe("migrateCrewItemsToServices — idempotency", () => {
  const crewItemRows: CrewItemRecord[] = [
    makeCrewItem({ id: "id1", visitId: "v1", type: "THERMOS", state: "STORED" }),
    makeCrewItem({ id: "id2", visitId: "v1", type: "DISHES", state: "RETURNED" }),
  ];

  const upsertMock = vi.fn(async (args: { where: { id: string }; create: object; update: object }) => ({
    id: args.where.id,
    ...args.create,
  }));

  beforeEach(() => {
    vi.resetModules();
    upsertMock.mockClear();
    vi.doMock("@/lib/db", () => ({
      prisma: {
        crewItem: {
          findMany: vi.fn(async () => crewItemRows),
        },
        service: {
          upsert: upsertMock,
        },
      },
    }));
  });

  it("calls upsert once per CrewItem row", async () => {
    const { migrateCrewItemsToServices: migrate } = await import(
      "@/lib/crewItemMigration"
    );
    const result = await migrate();
    expect(upsertMock).toHaveBeenCalledTimes(crewItemRows.length);
    expect(result.total).toBe(crewItemRows.length);
  });

  it("uses the deterministic id for each upsert (idempotency key)", async () => {
    const { migrateCrewItemsToServices: migrate } = await import(
      "@/lib/crewItemMigration"
    );
    await migrate();

    const firstCall = upsertMock.mock.calls[0][0] as { where: { id: string }; create: { id: string } };
    expect(firstCall.where.id).toBe("ci_id1");
    expect(firstCall.create.id).toBe("ci_id1");

    const secondCall = upsertMock.mock.calls[1][0] as { where: { id: string }; create: { id: string } };
    expect(secondCall.where.id).toBe("ci_id2");
    expect(secondCall.create.id).toBe("ci_id2");
  });

  it("passes empty update object (no-op on re-run)", async () => {
    const { migrateCrewItemsToServices: migrate } = await import(
      "@/lib/crewItemMigration"
    );
    await migrate();

    for (const call of upsertMock.mock.calls) {
      const args = call[0] as { update: object };
      expect(Object.keys(args.update)).toHaveLength(0);
    }
  });

  it("sets direction=BOTH, origin=CREW, target=CREW on created Service", async () => {
    const { migrateCrewItemsToServices: migrate } = await import(
      "@/lib/crewItemMigration"
    );
    await migrate();

    const createPayload = (upsertMock.mock.calls[0][0] as { create: MappedServicePartial }).create;
    expect(createPayload.direction).toBe("BOTH");
    expect(createPayload.origin).toBe("CREW");
    expect(createPayload.target).toBe("CREW");
  });

  it("maps STORED → PENDING in the created Service", async () => {
    const { migrateCrewItemsToServices: migrate } = await import(
      "@/lib/crewItemMigration"
    );
    await migrate();

    const storedItemCreate = (upsertMock.mock.calls[0][0] as { create: MappedServicePartial }).create;
    expect(storedItemCreate.state).toBe("PENDING"); // id1 was STORED
  });

  it("maps RETURNED → DELIVERED in the created Service", async () => {
    const { migrateCrewItemsToServices: migrate } = await import(
      "@/lib/crewItemMigration"
    );
    await migrate();

    const returnedItemCreate = (upsertMock.mock.calls[1][0] as { create: MappedServicePartial }).create;
    expect(returnedItemCreate.state).toBe("DELIVERED"); // id2 was RETURNED
  });

  it("does not delete any CrewItem rows", async () => {
    const { migrateCrewItemsToServices: migrate } = await import(
      "@/lib/crewItemMigration"
    );
    await migrate();

    // The mock has no `delete` method on crewItem, so if a deletion was
    // attempted the test would throw (TypeError: prisma.crewItem.delete is not a function).
    // The fact that we reach here without error proves no deletion happened.
    expect(upsertMock).toHaveBeenCalled(); // sanity check
  });

  it("running twice produces the same number of upsert calls each time (no accumulation)", async () => {
    const { migrateCrewItemsToServices: migrate } = await import(
      "@/lib/crewItemMigration"
    );
    await migrate();
    const firstRunCount = upsertMock.mock.calls.length;

    upsertMock.mockClear();
    await migrate();
    const secondRunCount = upsertMock.mock.calls.length;

    expect(secondRunCount).toBe(firstRunCount);
  });
});

// ---------------------------------------------------------------------------
// Type alias to keep test code readable
// ---------------------------------------------------------------------------
interface MappedServicePartial {
  id: string;
  visitId: string;
  type: string;
  state: string;
  direction: string;
  origin: string;
  target: string;
  quantity: number;
  customName: string | null;
  rawDescription: string | null;
}
