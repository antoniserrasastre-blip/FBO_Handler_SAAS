// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@/test/rtl";
import { TurnaroundAlerts } from "./TurnaroundAlert";

type FlightArg = Parameters<typeof TurnaroundAlerts>[0]["flights"][number];

function makeFlight(overrides: Record<string, unknown> = {}): FlightArg {
  return {
    id: "f1",
    callsign: "VLG123",
    state: "EXPECTED",
    eta: null,
    etd: null,
    services: [],
    ...overrides,
  } as unknown as FlightArg;
}

describe("<TurnaroundAlerts> clickable rows", () => {
  beforeEach(() => {
    // 2024-07-01T12:30:00Z — fake "now" so the alert is in window.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-07-01T12:30:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders rows as buttons when onSelectFlight is provided", () => {
    const spy = vi.fn();
    render(
      <TurnaroundAlerts
        flights={[makeFlight({ id: "f1", callsign: "VLG123", eta: "13:00" })]}
        onSelectFlight={spy}
      />,
    );
    const btn = screen.getByRole("button", { name: /Ir al vuelo VLG123/ });
    expect(btn).toBeTruthy();
    expect(btn.tagName).toBe("BUTTON");
    // aria-label should mention the verb + remaining minutes (30 min).
    expect(btn.getAttribute("aria-label")).toMatch(/llega en 30 min/);
  });

  it("clicking the row calls onSelectFlight with the flight id", () => {
    const spy = vi.fn();
    render(
      <TurnaroundAlerts
        flights={[makeFlight({ id: "abc-123", callsign: "VLG123", eta: "13:00" })]}
        onSelectFlight={spy}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Ir al vuelo VLG123/ }));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("abc-123");
  });

  it("does not render a button when onSelectFlight is omitted (backward compat)", () => {
    render(
      <TurnaroundAlerts
        flights={[makeFlight({ id: "f1", callsign: "VLG123", eta: "13:00" })]}
      />,
    );
    expect(screen.queryByRole("button", { name: /Ir al vuelo VLG123/ })).toBeNull();
    // Callsign is still visible inside the non-clickable div.
    expect(screen.getByText("VLG123")).toBeTruthy();
  });
});
