import { describe, it, expect } from "vitest";
import { toFlightView } from "@/lib/flightView";

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
