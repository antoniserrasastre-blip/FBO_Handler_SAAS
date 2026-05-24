import { describe, it, expect } from "vitest";
import { projectShiftQueues, visibleForPosts, type ShiftViewFlight } from "@/lib/shiftView";

// now fijo: 10:00 Zulu = 600 minutos. Ventana por defecto 60 min.
const NOW = 600;

// Baseline limpio: EXPECTED sin horas, sin servicios. Cada test sobreescribe
// sólo los campos relevantes.
function flight(overrides: Partial<ShiftViewFlight> & { id: string }): ShiftViewFlight {
  return {
    state: "EXPECTED",
    eta: null,
    etd: null,
    ata: null,
    atd: null,
    services: [],
    ...overrides,
  };
}

const opts = (posts: Parameters<typeof projectShiftQueues>[1]["posts"]) => ({
  posts,
  nowUtcMinutes: NOW,
  windowMinutes: 60,
});

describe("projectShiftQueues — exclusión de despegados", () => {
  it("un vuelo OFF_BLOCKS no aparece en ninguna cola", () => {
    const f = flight({ id: "off", state: "OFF_BLOCKS", eta: "10:30", etd: "10:30", services: [{ state: "PENDING" }] });
    const q = projectShiftQueues([f], opts(["ARRIVALS", "DEPARTURES", "RAMP", "RUNNER"]));
    expect(q.arrivals).toHaveLength(0);
    expect(q.departures).toHaveLength(0);
    expect(q.ramp).toHaveLength(0);
    expect(q.runner).toHaveLength(0);
  });
});

describe("projectShiftQueues — colas por hora", () => {
  it("ETA dentro de 60 min aparece en arrivals y en visibleForPosts(ARRIVALS)", () => {
    const f = flight({ id: "arr", state: "EXPECTED", eta: "10:30" }); // +30 min
    const q = projectShiftQueues([f], opts(["ARRIVALS"]));
    expect(q.arrivals.map((x) => x.id)).toEqual(["arr"]);

    const visible = visibleForPosts([f], opts(["ARRIVALS"]));
    expect(visible.map((x) => x.id)).toEqual(["arr"]);
  });

  it("ETD dentro de 60 min aparece en departures", () => {
    const f = flight({ id: "dep", state: "TURNAROUND", etd: "10:45" }); // +45 min
    const q = projectShiftQueues([f], opts(["DEPARTURES"]));
    expect(q.departures.map((x) => x.id)).toEqual(["dep"]);
  });

  it("ETA a +180 min NO entra en la ventana", () => {
    const f = flight({ id: "far", state: "EXPECTED", eta: "13:00" }); // +180 min
    const q = projectShiftQueues([f], opts(["ARRIVALS", "RAMP"]));
    expect(q.arrivals).toHaveLength(0);
    expect(q.ramp).toHaveLength(0);
  });
});

describe("projectShiftQueues — runner", () => {
  it("un vuelo con servicio pendiente aparece en runner", () => {
    const f = flight({ id: "svc", state: "ON_BLOCKS", services: [{ state: "DELIVERED" }, { state: "PENDING" }] });
    const q = projectShiftQueues([f], opts(["RUNNER"]));
    expect(q.runner.map((x) => x.id)).toEqual(["svc"]);
  });
});

describe("projectShiftQueues — cola mine (asignados)", () => {
  it("un vuelo en ventana asignado al usuario actual entra en mine", () => {
    const f = flight({ id: "owned", state: "ON_BLOCKS", eta: "10:20", assignedToId: "user-1" });
    const q = projectShiftQueues([f], { ...opts(["RAMP"]), currentUserId: "user-1" });
    expect(q.mine.map((x) => x.id)).toEqual(["owned"]);
  });

  it("un vuelo asignado a OTRO usuario no entra en mine", () => {
    const f = flight({ id: "other", state: "ON_BLOCKS", eta: "10:20", assignedToId: "user-2" });
    const q = projectShiftQueues([f], { ...opts(["RAMP"]), currentUserId: "user-1" });
    expect(q.mine).toHaveLength(0);
  });

  it("sin currentUserId, mine queda vacío aunque haya asignaciones", () => {
    const f = flight({ id: "owned", state: "ON_BLOCKS", eta: "10:20", assignedToId: "user-1" });
    const q = projectShiftQueues([f], opts(["RAMP"]));
    expect(q.mine).toHaveLength(0);
  });

  it("visibleForPosts(RAMP) incluye los vuelos de mine del usuario actual", () => {
    // ETA fuera de ventana → no entra por arrivals/departures; solo por mine.
    const f = flight({ id: "owned", state: "ON_BLOCKS", eta: "10:20", assignedToId: "user-1" });
    const visible = visibleForPosts([f], { ...opts(["RAMP"]), currentUserId: "user-1" });
    expect(visible.map((x) => x.id)).toEqual(["owned"]);
  });
});

describe("visibleForPosts — unión deduplicada", () => {
  it("ARRIVALS + DEPARTURES no duplica un vuelo presente en ambas colas", () => {
    // ON_BLOCKS con ETA y ETD en ventana → arrivals y departures a la vez.
    const both = flight({ id: "both", state: "ON_BLOCKS", eta: "10:20", etd: "10:50" });
    const visible = visibleForPosts([both], opts(["ARRIVALS", "DEPARTURES"]));
    expect(visible.map((x) => x.id)).toEqual(["both"]);
    expect(visible).toHaveLength(1);
  });

  it("preserva el orden de entrada", () => {
    const a = flight({ id: "a", state: "EXPECTED", eta: "10:10" });
    const d = flight({ id: "d", state: "TURNAROUND", etd: "10:30" });
    const visible = visibleForPosts([d, a], opts(["ARRIVALS", "DEPARTURES"]));
    expect(visible.map((x) => x.id)).toEqual(["d", "a"]);
  });
});
