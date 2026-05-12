import { describe, it, expect } from "vitest";
import {
  shortDate,
  isArrivalToday,
  isDepartureToday,
  deriveATA,
  deriveATD,
  nextEventMinutes,
  rowUrgency,
  computeHeaderStats,
  type FlightLite,
} from "./diaHelpers";

function mk(partial: Partial<FlightLite> = {}): FlightLite {
  return {
    id: "f1",
    callsign: "TST1",
    state: "EXPECTED",
    eta: null,
    etd: null,
    arrivalDate: null,
    departureDate: null,
    fuelState: "NOT_REQUESTED",
    toiletState: "NOT_REQUESTED",
    livePhase: null,
    liveLastSeenAt: null,
    liveOnGround: null,
    services: [],
    eventLogs: [],
    ...partial,
  } as FlightLite;
}

const day = new Date(Date.UTC(2026, 4, 12, 0, 0, 0));
const now = new Date(Date.UTC(2026, 4, 12, 10, 0, 0)); // 10:00 Z on the day

describe("shortDate", () => {
  it("zero-pads day and month", () => {
    expect(shortDate(new Date(Date.UTC(2026, 0, 5)))).toBe("05/01");
  });
});

describe("isArrivalToday / isDepartureToday", () => {
  it("treats no arrivalDate as today", () => {
    expect(isArrivalToday({ eta: "10:00", arrivalDate: null }, day)).toBe(true);
  });
  it("matches when arrivalDate equals shortDate", () => {
    expect(isArrivalToday({ eta: "10:00", arrivalDate: "12/05" }, day)).toBe(true);
  });
  it("rejects when arrivalDate is different day", () => {
    expect(isArrivalToday({ eta: "10:00", arrivalDate: "13/05" }, day)).toBe(false);
  });
  it("rejects when no eta", () => {
    expect(isArrivalToday({ eta: null, arrivalDate: null }, day)).toBe(false);
  });
});

describe("deriveATA", () => {
  it("uses eventLog timestamp when state went to ON_BLOCKS", () => {
    const f = mk({
      state: "ON_BLOCKS",
      eventLogs: [
        { id: "e1", flightId: "f1", userId: null, action: "Estado → ON_BLOCKS", details: null, timestamp: new Date(Date.UTC(2026, 4, 12, 9, 45)) } as never,
      ],
    });
    expect(deriveATA(f)).toBe("09:45");
  });

  it("falls back to liveLastSeenAt when livePhase is LANDED", () => {
    const f = mk({
      state: "EXPECTED",
      livePhase: "LANDED",
      liveLastSeenAt: new Date(Date.UTC(2026, 4, 12, 9, 30)),
    });
    expect(deriveATA(f)).toBe("09:30");
  });

  it("returns null when neither source available", () => {
    expect(deriveATA(mk())).toBeNull();
  });
});

describe("deriveATD", () => {
  it("uses eventLog timestamp when state went to OFF_BLOCKS", () => {
    const f = mk({
      state: "OFF_BLOCKS",
      eventLogs: [
        { id: "e1", flightId: "f1", userId: null, action: "Estado → OFF_BLOCKS", details: null, timestamp: new Date(Date.UTC(2026, 4, 12, 11, 5)) } as never,
      ],
    });
    expect(deriveATD(f)).toBe("11:05");
  });

  it("requires liveOnGround=false for live fallback (avoid using on-ground last seen as ATD)", () => {
    const onGround = mk({
      livePhase: "DEPARTED",
      liveLastSeenAt: new Date(Date.UTC(2026, 4, 12, 11, 0)),
      liveOnGround: true,
    });
    expect(deriveATD(onGround)).toBeNull();

    const airborne = mk({
      livePhase: "DEPARTED",
      liveLastSeenAt: new Date(Date.UTC(2026, 4, 12, 11, 0)),
      liveOnGround: false,
    });
    expect(deriveATD(airborne)).toBe("11:00");
  });
});

describe("nextEventMinutes", () => {
  it("EXPECTED → ETA", () => {
    const f = mk({ state: "EXPECTED", eta: "11:00" });
    expect(nextEventMinutes(f, day, now)).toBe(60);
  });
  it("PARKED → ETD", () => {
    const f = mk({ state: "PARKED", etd: "12:30" });
    expect(nextEventMinutes(f, day, now)).toBe(150);
  });
  it("OFF_BLOCKS → null", () => {
    const f = mk({ state: "OFF_BLOCKS", etd: "08:00" });
    expect(nextEventMinutes(f, day, now)).toBeNull();
  });
});

describe("rowUrgency", () => {
  it("departed when state=OFF_BLOCKS", () => {
    expect(rowUrgency(mk({ state: "OFF_BLOCKS" }), day, now)).toBe("departed");
  });

  it("boarding when state=BOARDING", () => {
    expect(rowUrgency(mk({ state: "BOARDING" }), day, now)).toBe("boarding");
  });

  it("alert when ETD past with no completion (state still TURNAROUND)", () => {
    const f = mk({ state: "TURNAROUND", etd: "09:30" }); // 30 min ago
    expect(rowUrgency(f, day, now)).toBe("alert");
  });

  it("alert when ETD <30min and pending dep services", () => {
    const f = mk({
      state: "TURNAROUND",
      etd: "10:20",
      fuelState: "REQUESTED",
      services: [{ state: "PENDING", phase: "DEPARTURE" }],
    });
    expect(rowUrgency(f, day, now)).toBe("alert");
  });

  it("imminent when ETD <30min but services done", () => {
    const f = mk({
      state: "TURNAROUND",
      etd: "10:20",
      fuelState: "SERVED",
      services: [{ state: "DELIVERED", phase: "DEPARTURE" }],
    });
    expect(rowUrgency(f, day, now)).toBe("imminent");
  });

  it("normal when ETD >90min away", () => {
    const f = mk({ state: "PARKED", etd: "13:00" });
    expect(rowUrgency(f, day, now)).toBe("normal");
  });
});

describe("computeHeaderStats", () => {
  it("counts arrivals, departures, approaching, alerts", () => {
    const flights: FlightLite[] = [
      mk({ id: "1", state: "EXPECTED", eta: "11:00", arrivalDate: "12/05", livePhase: "APPROACHING" }),
      mk({ id: "2", state: "ON_BLOCKS", etd: "12:00", departureDate: "12/05" }),
      mk({ id: "3", state: "TURNAROUND", etd: "10:20", departureDate: "12/05", fuelState: "REQUESTED", services: [{ state: "PENDING", phase: "DEPARTURE" }] }),
    ];
    const s = computeHeaderStats(flights, day, now);
    expect(s.arrivals).toBe(1);
    expect(s.departures).toBe(2);
    expect(s.approaching).toBe(1);
    // f2 is ON_BLOCKS (arrival activa) — no cuenta como pending DEP services.
    // f3 está en TURNAROUND con fuel y catering pendientes.
    expect(s.pendingDepServices).toBe(1);
    expect(s.alerts).toBe(1); // f3
  });
});
