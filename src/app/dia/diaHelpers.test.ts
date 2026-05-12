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
  arrivalSegmentState,
  departureSegmentState,
  type FlightLite,
} from "./diaHelpers";

function mk(partial: Partial<FlightLite> = {}): FlightLite {
  return {
    id: "f1",
    callsign: "TST1",
    state: "EXPECTED",
    eta: null,
    etd: null,
    ata: null,
    atd: null,
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
  it("matches when arrivalDate equals shortDate (DD/MM)", () => {
    expect(isArrivalToday({ eta: "10:00", arrivalDate: "12/05" }, day)).toBe(true);
  });
  it("matches when arrivalDate is DD/MM/YY (formato real del PDF parser)", () => {
    // Regression: el parser guarda "12/05/26"; mi helper antes solo aceptaba "12/05"
    // y por eso /dia mostraba "sin llegada hoy" para todos los vuelos.
    expect(isArrivalToday({ eta: "10:00", arrivalDate: "12/05/26" }, day)).toBe(true);
  });
  it("departure with DD/MM/YY also works", () => {
    expect(isDepartureToday({ etd: "14:00", departureDate: "12/05/26" }, day)).toBe(true);
  });
  it("rejects when arrivalDate is different day (with year)", () => {
    expect(isArrivalToday({ eta: "10:00", arrivalDate: "13/05/26" }, day)).toBe(false);
  });
  it("rejects when no eta", () => {
    expect(isArrivalToday({ eta: null, arrivalDate: null }, day)).toBe(false);
  });
});

describe("deriveATA", () => {
  it("prefers explicit ata field over event log / live", () => {
    const f = mk({
      ata: "09:42",
      eventLogs: [
        { id: "e1", flightId: "f1", userId: null, action: "Estado → ON_BLOCKS", details: null, timestamp: new Date(Date.UTC(2026, 4, 12, 10, 0)) } as never,
      ],
      livePhase: "LANDED",
      liveLastSeenAt: new Date(Date.UTC(2026, 4, 12, 9, 30)),
    });
    expect(deriveATA(f)).toBe("09:42");
  });

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
  it("prefers explicit atd field over event log / live", () => {
    const f = mk({
      atd: "12:15",
      eventLogs: [
        { id: "e1", flightId: "f1", userId: null, action: "Estado → OFF_BLOCKS", details: null, timestamp: new Date(Date.UTC(2026, 4, 12, 13, 0)) } as never,
      ],
    });
    expect(deriveATD(f)).toBe("12:15");
  });

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

describe("arrivalSegmentState (highlighter por celda)", () => {
  it("returns null cuando no hay ETA", () => {
    expect(arrivalSegmentState(mk(), day, now)).toBeNull();
  });

  it("today-pending cuando es de hoy y aun no ha llegado", () => {
    const f = mk({ eta: "11:00", arrivalDate: "12/05/26" });
    expect(arrivalSegmentState(f, day, now)).toBe("today-pending");
  });

  it("today-overdue cuando ETA paso hace mas de 5 min y no hay ATA", () => {
    const f = mk({ eta: "09:00", arrivalDate: "12/05/26" });
    expect(arrivalSegmentState(f, day, now)).toBe("today-overdue");
  });

  it("today-done cuando hay ATA registrada", () => {
    const f = mk({ eta: "09:00", arrivalDate: "12/05/26", ata: "09:05" });
    expect(arrivalSegmentState(f, day, now)).toBe("today-done");
  });

  it("past cuando arrivalDate es anterior al dia visualizado", () => {
    const f = mk({ eta: "16:05", arrivalDate: "11/05/26" });
    expect(arrivalSegmentState(f, day, now)).toBe("past");
  });

  it("future cuando arrivalDate es posterior", () => {
    const f = mk({ eta: "06:00", arrivalDate: "13/05/26" });
    expect(arrivalSegmentState(f, day, now)).toBe("future");
  });

  it("acepta arrivalDate sin anio (DD/MM)", () => {
    const f = mk({ eta: "11:00", arrivalDate: "12/05" });
    expect(arrivalSegmentState(f, day, now)).toBe("today-pending");
  });
});

describe("departureSegmentState", () => {
  it("today-done cuando hay ATD", () => {
    const f = mk({ etd: "11:30", departureDate: "12/05/26", atd: "11:35" });
    expect(departureSegmentState(f, day, now)).toBe("today-done");
  });

  it("today-overdue cuando ETD paso sin ATD", () => {
    const f = mk({ etd: "08:00", departureDate: "12/05/26" });
    expect(departureSegmentState(f, day, now)).toBe("today-overdue");
  });

  it("future cuando departureDate es manana", () => {
    const f = mk({ etd: "08:00", departureDate: "13/05/26" });
    expect(departureSegmentState(f, day, now)).toBe("future");
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
