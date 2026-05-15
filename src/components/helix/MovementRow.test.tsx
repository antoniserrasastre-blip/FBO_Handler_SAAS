// @vitest-environment happy-dom

import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/rtl";
import { MovementRow } from "./MovementRow";

const baseProps = {
  airport: "LEPA",
  state: "parked" as const,
  paxCount: 4,
  crewCount: 2,
};

describe("MovementRow", () => {
  it("renders an ARR chip for arrivals", () => {
    render(<MovementRow direction="ARRIVAL" time="08:30" {...baseProps} />);
    expect(screen.getByText("ARR")).toBeTruthy();
  });

  it("renders a DEP chip for departures", () => {
    render(<MovementRow direction="DEPARTURE" time="10:15" {...baseProps} />);
    expect(screen.getByText("DEP")).toBeTruthy();
  });

  it("shows the scheduled time and surfaces the airport ICAO", () => {
    const { container } = render(
      <MovementRow direction="ARRIVAL" time="07:45" {...baseProps} />
    );
    expect(container.textContent).toContain("07:45");
    expect(container.textContent).toContain("LEPA");
  });

  it("renders a placeholder time when ETA/ETD is missing", () => {
    // ALS imports occasionally skip ETD for legs that aren't yet planned.
    // The handler should see clearly that the time is unknown, not 00:00.
    const { container } = render(
      <MovementRow direction="DEPARTURE" time={null} {...baseProps} />
    );
    expect(container.textContent).toContain("--:--");
  });

  it("shows pax and crew counts in the meta strip", () => {
    const { container } = render(
      <MovementRow direction="ARRIVAL" time="08:00" {...baseProps} paxCount={6} crewCount={3} />
    );
    // Format used by the strip: "6p · 3c"
    expect(container.textContent).toMatch(/6p/);
    expect(container.textContent).toMatch(/3c/);
  });

  it("shows the parking stand when assigned", () => {
    render(
      <MovementRow direction="ARRIVAL" time="08:00" {...baseProps} parking="P-12" />
    );
    expect(screen.getByText("P-12")).toBeTruthy();
  });

  it("applies the cancelled modifier class when the leg is cancelled", () => {
    // Cancelled legs fade visually so the handler can scan the day at a
    // glance and skip them.
    const { container } = render(
      <MovementRow direction="ARRIVAL" time="08:00" {...baseProps} cancelled />
    );
    const row = container.querySelector(".hx-movement-row");
    expect(row?.className).toMatch(/cancelled/);
  });

  it("falls back to em-dash when no airport is given", () => {
    render(
      <MovementRow direction="ARRIVAL" time="08:00" {...baseProps} airport={null} />
    );
    expect(screen.getByText("—")).toBeTruthy();
  });
});
