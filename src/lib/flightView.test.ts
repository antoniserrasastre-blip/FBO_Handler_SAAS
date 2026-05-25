import { describe, it, expect } from "vitest";
import { toFlightView, mergeCrewItemsIntoServices } from "@/lib/flightView";
import type { FlightViewService } from "@/types/v2";
import type { CrewItemRecord } from "@/lib/crewItemMigration";

// Helper to build a minimal VisitWithMovements fixture. Only the fields used
// by `toFlightView()` are populated — the rest default to safe blanks.
type AnyRecord = Record<string, unknown>;

interface VisitFixtureInput {
  id?: string;
  palmaDay?: Date;
  type?: string | null;
  arrivalDate?: Date | null;
  departureDate?: Date | null;
  assignedToId?: string | null;
  assignedTo?: { id: string; name: string } | null;
  movements: AnyRecord[];
}

function buildVisit(input: VisitFixtureInput) {
  const now = new Date("2026-05-22T00:00:00Z");
  return {
    id: input.id ?? "visit-1",
    aircraftId: "ac-1",
    operatorId: null,
    palmaDay: input.palmaDay ?? new Date("2026-05-22T00:00:00Z"),
    type: input.type ?? "TURNAROUND",
    arrivalDate: input.arrivalDate ?? null,
    departureDate: input.departureDate ?? null,
    notes: null,
    assignedToId: input.assignedToId ?? null,
    assignedTo: input.assignedTo ?? null,
    createdAt: now,
    updatedAt: now,
    aircraft: { registration: "EC-TEST", aircraftType: "C68A" },
    movements: input.movements,
  };
}

describe("toFlightView — arrivalInstant", () => {
  it("combines ARRIVAL scheduledDate + eta HH:MM into UTC instant", () => {
    const visit = buildVisit({
      movements: [
        {
          id: "mov-arr",
          direction: "ARRIVAL",
          scheduledDate: new Date("2026-05-22T00:00:00Z"),
          eta: "07:30",
        },
      ],
    });
    const fv = toFlightView(visit);
    expect(fv.arrivalInstant).toBeInstanceOf(Date);
    expect((fv.arrivalInstant as Date).toISOString()).toBe("2026-05-22T07:30:00.000Z");
  });

  it("returns null when arrival eta is missing", () => {
    const visit = buildVisit({
      movements: [
        {
          id: "mov-arr",
          direction: "ARRIVAL",
          scheduledDate: new Date("2026-05-22T00:00:00Z"),
          eta: null,
        },
      ],
    });
    const fv = toFlightView(visit);
    expect(fv.arrivalInstant).toBeNull();
  });

  it("returns null when arrival eta is malformed", () => {
    const visit = buildVisit({
      movements: [
        {
          id: "mov-arr",
          direction: "ARRIVAL",
          scheduledDate: new Date("2026-05-22T00:00:00Z"),
          eta: "1430",
        },
      ],
    });
    const fv = toFlightView(visit);
    expect(fv.arrivalInstant).toBeNull();
  });
});

describe("toFlightView — departureInstant", () => {
  it("combines DEPARTURE scheduledDate + etd HH:MM into UTC instant", () => {
    const visit = buildVisit({
      movements: [
        {
          id: "mov-dep",
          direction: "DEPARTURE",
          scheduledDate: new Date("2026-05-22T00:00:00Z"),
          etd: "14:00",
        },
      ],
    });
    const fv = toFlightView(visit);
    expect(fv.departureInstant).toBeInstanceOf(Date);
    expect((fv.departureInstant as Date).toISOString()).toBe("2026-05-22T14:00:00.000Z");
  });
});

describe("toFlightView — assignación de rampa", () => {
  it("mapea assignedToId y assignedTo.name del Visit", () => {
    const visit = buildVisit({
      assignedToId: "user-7",
      assignedTo: { id: "user-7", name: "Pistero Pep" },
      movements: [{ id: "mov-dep", direction: "DEPARTURE", etd: "14:00" }],
    });
    const fv = toFlightView(visit);
    expect(fv.assignedToId).toBe("user-7");
    expect(fv.assignedToName).toBe("Pistero Pep");
  });

  it("deja assignedToId/assignedToName en null cuando el vuelo no está asignado", () => {
    const visit = buildVisit({
      movements: [{ id: "mov-dep", direction: "DEPARTURE", etd: "14:00" }],
    });
    const fv = toFlightView(visit);
    expect(fv.assignedToId).toBeNull();
    expect(fv.assignedToName).toBeNull();
  });
});

describe("toFlightView — overnight visit spans two days", () => {
  it("anchors each instant to its own leg's scheduledDate", () => {
    const visit = buildVisit({
      type: "OVERNIGHT",
      movements: [
        {
          id: "mov-arr",
          direction: "ARRIVAL",
          scheduledDate: new Date("2026-05-22T00:00:00Z"),
          eta: "23:30",
        },
        {
          id: "mov-dep",
          direction: "DEPARTURE",
          scheduledDate: new Date("2026-05-23T00:00:00Z"),
          etd: "06:00",
        },
      ],
    });
    const fv = toFlightView(visit);
    expect((fv.arrivalInstant as Date).toISOString()).toBe("2026-05-22T23:30:00.000Z");
    expect((fv.departureInstant as Date).toISOString()).toBe("2026-05-23T06:00:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// mergeCrewItemsIntoServices — read-merge helper
// ---------------------------------------------------------------------------

function makeService(overrides: Partial<FlightViewService> = {}): FlightViewService {
  return {
    id: "svc-1",
    visitId: "visit-1",
    type: "CATERING",
    direction: "DEPARTURE",
    customName: null,
    reference: null,
    target: "PAX",
    origin: null,
    quantity: 1,
    rawDescription: null,
    state: "PENDING",
    arrivedAt: null,
    deliveredAt: null,
    scheduledAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function makeCrewItem(overrides: Partial<CrewItemRecord> = {}): CrewItemRecord {
  return {
    id: "ci-1",
    visitId: "visit-1",
    type: "THERMOS",
    customName: null,
    quantity: 1,
    state: "STORED",
    notes: null,
    ...overrides,
  };
}

describe("mergeCrewItemsIntoServices — CrewItem sin Service espejo", () => {
  it("aparece UNA vez con los campos mapeados correctos", () => {
    const services: FlightViewService[] = [];
    const crewItems = [makeCrewItem({ id: "ci-1", type: "THERMOS", state: "STORED", quantity: 2 })];

    const result = mergeCrewItemsIntoServices(services, crewItems);

    expect(result).toHaveLength(1);
    const svc = result[0];
    expect(svc.id).toBe("ci_ci-1");
    expect(svc.type).toBe("THERMOS");
    expect(svc.state).toBe("PENDING");     // STORED → PENDING
    expect(svc.direction).toBe("BOTH");
    expect(svc.origin).toBe("CREW");
    expect(svc.target).toBe("CREW");
    expect(svc.quantity).toBe(2);
    expect(svc.visitId).toBe("visit-1");
  });

  it("mapea RETURNED → DELIVERED", () => {
    const result = mergeCrewItemsIntoServices(
      [],
      [makeCrewItem({ state: "RETURNED" })],
    );
    expect(result[0].state).toBe("DELIVERED");
  });
});

describe("mergeCrewItemsIntoServices — CrewItem con Service espejo ya existente", () => {
  it("aparece UNA sola vez (el Service real manda, no se duplica)", () => {
    const mirrorService = makeService({ id: "ci_ci-1", type: "THERMOS", origin: "CREW", target: "CREW", state: "PENDING" });
    const crewItems = [makeCrewItem({ id: "ci-1", type: "THERMOS", state: "STORED" })];

    const result = mergeCrewItemsIntoServices([mirrorService], crewItems);

    expect(result).toHaveLength(1);
    // The real Service row wins (retains its original fields, not the projected ones)
    expect(result[0].id).toBe("ci_ci-1");
    expect(result[0].state).toBe("PENDING");
  });

  it("no añade duplicado aunque el CrewItem tenga estado distinto al Service", () => {
    // Service was manually edited to DELIVERED after migration
    const mirrorService = makeService({ id: "ci_ci-2", origin: "CREW", state: "DELIVERED" });
    const crewItem = makeCrewItem({ id: "ci-2", state: "STORED" }); // still STORED in CrewItem table

    const result = mergeCrewItemsIntoServices([mirrorService], [crewItem]);

    expect(result).toHaveLength(1);
    expect(result[0].state).toBe("DELIVERED"); // Service real manda
  });
});

describe("mergeCrewItemsIntoServices — Services normales + CrewItems", () => {
  it("todos presentes, sin duplicados, orden estable (Services primero, luego crew)", () => {
    const svcA = makeService({ id: "svc-a", type: "CATERING" });
    const svcB = makeService({ id: "svc-b", type: "WATER" });
    // ci-X has no mirror → should be appended
    const crewItem = makeCrewItem({ id: "ci-x", type: "COOLER_BAG", state: "STORED" });

    const result = mergeCrewItemsIntoServices([svcA, svcB], [crewItem]);

    expect(result).toHaveLength(3);
    expect(result[0].id).toBe("svc-a");
    expect(result[1].id).toBe("svc-b");
    expect(result[2].id).toBe("ci_ci-x");
  });

  it("no duplica cuando algunos crewItems tienen espejo y otros no", () => {
    const mirrorSvc = makeService({ id: "ci_ci-m", type: "THERMOS", origin: "CREW" });
    const normalSvc = makeService({ id: "svc-n", type: "GPU" });
    // ci-m has mirror → skip; ci-u has no mirror → append
    const crewItems = [
      makeCrewItem({ id: "ci-m", type: "THERMOS" }),
      makeCrewItem({ id: "ci-u", type: "DISHES" }),
    ];

    const result = mergeCrewItemsIntoServices([mirrorSvc, normalSvc], crewItems);

    expect(result).toHaveLength(3);
    const ids = result.map((s) => s.id);
    expect(ids).toContain("ci_ci-m");  // real service retained
    expect(ids).toContain("svc-n");
    expect(ids).toContain("ci_ci-u"); // projected from unmigrated crewItem
    // No duplicates
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("devuelve el mismo array sin copiar cuando no hay crewItems sin espejo", () => {
    const services = [makeService({ id: "svc-1" }), makeService({ id: "svc-2" })];
    // All crewItems have mirrors already in services list
    const crewItems = [makeCrewItem({ id: "ci-1" })];
    const mirrorForCi1 = makeService({ id: "ci_ci-1", origin: "CREW" });
    const servicesWithMirror = [services[0], services[1], mirrorForCi1];

    const result = mergeCrewItemsIntoServices(servicesWithMirror, crewItems);
    expect(result).toHaveLength(3); // no extras added
    expect(result.map((s) => s.id)).not.toContain("ci_ci-1_duplicate");
  });
});

describe("mergeCrewItemsIntoServices — edge cases", () => {
  it("lista vacía con crewItems sin espejo → solo crewItems proyectados", () => {
    const result = mergeCrewItemsIntoServices(
      [],
      [makeCrewItem({ id: "ci-1" }), makeCrewItem({ id: "ci-2", type: "DISHES" })],
    );
    expect(result).toHaveLength(2);
    expect(result.every((s) => s.origin === "CREW")).toBe(true);
  });

  it("sin crewItems → services sin modificar", () => {
    const services = [makeService({ id: "svc-1" }), makeService({ id: "svc-2" })];
    const result = mergeCrewItemsIntoServices(services, []);
    // When no extras are added the original array is returned as-is
    expect(result).toBe(services);
  });

  it("preserva rawDescription (notes) del CrewItem en el servicio proyectado", () => {
    const crewItem = makeCrewItem({ id: "ci-notes", notes: "Fragile" });
    const result = mergeCrewItemsIntoServices([], [crewItem]);
    expect(result[0].rawDescription).toBe("Fragile");
  });

  it("customName se propaga del CrewItem al servicio proyectado", () => {
    const crewItem = makeCrewItem({ id: "ci-custom", type: "CUSTOM", customName: "Bolsa especial" });
    const result = mergeCrewItemsIntoServices([], [crewItem]);
    expect(result[0].customName).toBe("Bolsa especial");
  });
});

describe("toFlightView — services incluye CrewItems sin espejo", () => {
  it("un CrewItem sin Service espejo aparece en flight.services con campos correctos", () => {
    const visit = buildVisit({
      movements: [{ id: "mov-dep", direction: "DEPARTURE", etd: "14:00" }],
    });
    // Inject crewItems and empty services into the visit fixture
    const visitWithCrew = {
      ...visit,
      services: [],
      crewItems: [{ id: "ci-1", visitId: visit.id, type: "THERMOS", customName: null, quantity: 1, state: "STORED", notes: null }],
    };

    const fv = toFlightView(visitWithCrew);
    expect(fv.services).toHaveLength(1);
    const svc = fv.services![0];
    expect(svc.id).toBe("ci_ci-1");
    expect(svc.type).toBe("THERMOS");
    expect(svc.state).toBe("PENDING");
    expect(svc.origin).toBe("CREW");
    expect(svc.target).toBe("CREW");
    expect(svc.direction).toBe("BOTH");
  });

  it("Service espejo + CrewItem → aparece UNA vez, gana el Service real", () => {
    const visit = buildVisit({
      movements: [{ id: "mov-dep", direction: "DEPARTURE", etd: "14:00" }],
    });
    const mirrorService = makeService({ id: "ci_ci-1", type: "THERMOS", origin: "CREW", state: "DELIVERED" });
    const visitWithBoth = {
      ...visit,
      services: [mirrorService],
      crewItems: [{ id: "ci-1", visitId: visit.id, type: "THERMOS", customName: null, quantity: 1, state: "STORED", notes: null }],
    };

    const fv = toFlightView(visitWithBoth);
    expect(fv.services).toHaveLength(1);
    expect(fv.services![0].id).toBe("ci_ci-1");
    expect(fv.services![0].state).toBe("DELIVERED"); // Service real manda
  });

  it("Services normales + crewItems → todos presentes sin duplicados", () => {
    const visit = buildVisit({
      movements: [{ id: "mov-dep", direction: "DEPARTURE", etd: "14:00" }],
    });
    const normalSvc = makeService({ id: "svc-catering", type: "CATERING" });
    const visitWithAll = {
      ...visit,
      services: [normalSvc],
      crewItems: [{ id: "ci-1", visitId: visit.id, type: "THERMOS", customName: null, quantity: 1, state: "STORED", notes: null }],
    };

    const fv = toFlightView(visitWithAll);
    expect(fv.services).toHaveLength(2);
    const ids = fv.services!.map((s) => s.id);
    expect(ids).toContain("svc-catering");
    expect(ids).toContain("ci_ci-1");
    expect(new Set(ids).size).toBe(2); // no duplicates
  });
});
