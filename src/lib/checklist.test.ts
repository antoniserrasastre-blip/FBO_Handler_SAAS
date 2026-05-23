import { describe, it, expect } from "vitest";
import {
  tasksForFlight,
  checklistProgress,
  type ChecklistFlight,
} from "@/lib/checklist";

// Baseline flight: both legs exist, Schengen origin (LFPB Paris), no pets,
// pax/crew on both legs, no services. Override only what each test needs.
const base: ChecklistFlight = {
  origin: "LFPB",
  petCount: 0,
  paxArrival: 4,
  paxDeparture: 4,
  crewArrival: 2,
  crewDeparture: 2,
  arrivalMovementId: "arr-1",
  departureMovementId: "dep-1",
  services: [],
  tasks: [],
};

const types = (f: ChecklistFlight, opts?: Parameters<typeof tasksForFlight>[1]) =>
  tasksForFlight(f, opts).map((t) => t.type);

describe("tasksForFlight — Schengen, sin mascotas", () => {
  it("no genera POLICE_NOTIFIED ni tareas de mascotas", () => {
    const result = types(base);
    expect(result).not.toContain("POLICE_NOTIFIED");
    expect(result).not.toContain("PETS_ARRIVAL");
    expect(result).not.toContain("PETS_DEPARTURE");
  });
});

describe("tasksForFlight — mascotas", () => {
  it("petCount 2 genera PETS_ARRIVAL y PETS_DEPARTURE", () => {
    const result = types({ ...base, petCount: 2 });
    expect(result).toContain("PETS_ARRIVAL");
    expect(result).toContain("PETS_DEPARTURE");
  });
});

describe("tasksForFlight — origen no-Schengen", () => {
  it("EGLL (Londres) genera POLICE_NOTIFIED", () => {
    const result = types({ ...base, origin: "EGLL" });
    expect(result).toContain("POLICE_NOTIFIED");
  });
});

describe("tasksForFlight — filtro por puesto", () => {
  it("posts ARRIVALS solo devuelve tareas de llegada", () => {
    const result = tasksForFlight(base, { posts: ["ARRIVALS"] });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((t) => t.direction === "ARRIVAL")).toBe(true);
    expect(result.every((t) => t.post === "ARRIVALS")).toBe(true);
  });
});

describe("tasksForFlight — estado desde flight.tasks", () => {
  it("una fila DONE se refleja como DONE", () => {
    const flight: ChecklistFlight = {
      ...base,
      tasks: [{ type: "PAX_COUNTED", direction: "ARRIVAL", state: "DONE" }],
    };
    const paxTask = tasksForFlight(flight).find((t) => t.type === "PAX_COUNTED");
    expect(paxTask?.state).toBe("DONE");
  });
});

describe("tasksForFlight — leg de salida ausente", () => {
  it("sin departureMovementId no genera tareas de salida", () => {
    const result = types({ ...base, departureMovementId: null });
    expect(result).not.toContain("GPU");
    expect(result).not.toContain("WATER");
    expect(result).not.toContain("CLEANING");
    expect(result).not.toContain("SECURITY_PAX");
    expect(result).not.toContain("SECURITY_CREW");
    expect(result.every((t) => t === "PAX_COUNTED" || t === "CREW_RECEIVED")).toBe(true);
  });
});

describe("checklistProgress — DONE y NA cuentan como done", () => {
  it("cuenta DONE y NA como hechas", () => {
    const flight: ChecklistFlight = {
      ...base,
      tasks: [
        { type: "PAX_COUNTED", direction: "ARRIVAL", state: "DONE" },
        { type: "GPU", direction: "DEPARTURE", state: "NA" },
      ],
    };
    const tasks = tasksForFlight(flight);
    const { done, total } = checklistProgress(tasks);
    expect(total).toBe(tasks.length);
    expect(done).toBe(2);
  });
});
