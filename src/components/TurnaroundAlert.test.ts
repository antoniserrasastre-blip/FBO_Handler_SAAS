import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getTurnaroundAlerts } from "./TurnaroundAlert";

function makeFlight(overrides: Record<string, unknown> = {}) {
  return {
    id: "f1",
    callsign: "ABC123",
    state: "EXPECTED",
    eta: null,
    etd: null,
    services: [],
    ...overrides,
  } as unknown as Parameters<typeof getTurnaroundAlerts>[0][number];
}

describe("getTurnaroundAlerts (UTC handling)", () => {
  beforeEach(() => {
    // 2024-07-01T12:30:00Z — in Palma (CEST = UTC+2) this is 14:30 local.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-07-01T12:30:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("treats flight eta as Zulu and computes minutesLeft against UTC now", () => {
    // ETA 13:00 Zulu, now is 12:30 Zulu → 30 min until arrival
    const alerts = getTurnaroundAlerts([
      makeFlight({ id: "f1", state: "EXPECTED", eta: "13:00" }),
    ]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].kind).toBe("ARRIVAL");
    expect(alerts[0].minutesLeft).toBe(30);
  });

  it("does NOT use local hours (would give -90 min instead of +30 min)", () => {
    const alerts = getTurnaroundAlerts([
      makeFlight({ id: "f1", state: "EXPECTED", eta: "13:00" }),
    ]);
    // If broken (local): h=14, minutesUntilArrival = 13*60 - 14*60 - 30 = -90
    expect(alerts[0].minutesLeft).not.toBe(-90);
  });

  it("does NOT alert for an arrival that should have happened hours ago (out of window)", () => {
    // ETA 03:00 Zulu, now is 12:30 Zulu → -570 min. Antes esto disparaba alerta
    // de 'llega hace 570 min'. Ahora la ventana es [-15, +30].
    const alerts = getTurnaroundAlerts([
      makeFlight({ id: "f1", state: "EXPECTED", eta: "03:00" }),
    ]);
    expect(alerts).toHaveLength(0);
  });

  it("alerts when ETA is just past (within 15 min) — handler still hasn't logged ATA", () => {
    // ETA 12:20, now 12:30 → -10 min
    const alerts = getTurnaroundAlerts([
      makeFlight({ id: "f1", state: "EXPECTED", eta: "12:20" }),
    ]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].minutesLeft).toBe(-10);
  });

  it("does NOT alert for a pernocta whose arrival was yesterday (arrivalDate != today)", () => {
    // Pernocta: llegada ayer 22:00, salida hoy. La lista del día incluye el
    // vuelo por su departureDate, pero el ETA es de ayer y no debe disparar
    // alerta de llegada hoy.
    const alerts = getTurnaroundAlerts([
      makeFlight({
        id: "f1",
        state: "EXPECTED",
        eta: "22:00",
        arrivalDate: "30/06", // ayer (refDay = 01/07)
        departureDate: "01/07",
      }),
    ]);
    expect(alerts.filter((a) => a.kind === "ARRIVAL")).toHaveLength(0);
  });

  it("does NOT alert for a departure on a different day (departureDate != today)", () => {
    const alerts = getTurnaroundAlerts([
      makeFlight({
        id: "f1",
        state: "PARKED",
        etd: "13:00",
        arrivalDate: "01/07",
        departureDate: "02/07", // mañana
        services: [{ state: "PENDING", phase: "DEPARTURE" }],
      }),
    ]);
    expect(alerts).toHaveLength(0);
  });

  it("accepts an explicit referenceDate (used by /dia and home)", () => {
    // Today (per fake timer) = 01/07. Reference set to 02/07 → alertas se
    // calculan para ese día.
    const alerts = getTurnaroundAlerts(
      [
        makeFlight({
          id: "f1",
          state: "EXPECTED",
          eta: "12:40",
          arrivalDate: "02/07",
        }),
      ],
      new Date("2024-07-02T12:30:00.000Z"),
    );
    // currentMinutes sigue siendo el real (12:30Z) porque la función usa
    // new Date() para "ahora"; solo el filtro por día cambia.
    expect(alerts).toHaveLength(1);
    expect(alerts[0].minutesLeft).toBe(10);
  });
});
