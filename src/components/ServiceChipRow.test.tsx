// @vitest-environment happy-dom
/**
 * ServiceChipRow.test.tsx — Characterisation tests for <ServiceChipRow>
 *
 * Focus: documenting that the component renders ALL services regardless of
 * `direction` field (ARRIVAL / DEPARTURE / BOTH), and that the `direction`
 * field is currently IGNORED for filtering purposes in this component.
 *
 * BUG / DESIGN NOTE:
 *   ServiceChipRow renders every service in the `services` prop in a single
 *   flat list regardless of `direction`. There is NO per-direction separator or
 *   filter inside the component (src/components/ServiceChipRow.tsx, lines
 *   136–177). Whether a service is tagged ARRIVAL, DEPARTURE, or BOTH makes
 *   no visual difference to the chip or its position in the strip.
 *
 *   This means that on a visit with:
 *     - 1 ARRIVAL catering (e.g. GPU)
 *     - 1 DEPARTURE catering (e.g. CATERING)
 *   both chips appear in the strip together, unseparated.
 *
 *   Recommendation: if the /lista view needs to surface ARRIVAL vs DEPARTURE
 *   services separately, a `filterDirection` prop should be added to
 *   ServiceChipRow and applied with `.filter()` before rendering.
 *
 * ADDITIONAL OBSERVATION (captured in test "direction field does not appear"):
 *   The chip DOES show the `target` field (CREW/PAX) as a suffix (e.g. "GPU · Crew").
 *   The `direction` field (ARRIVAL/DEPARTURE/BOTH) is NOT rendered at all.
 *   However, the makeService factory's default `target` is "ARRIVAL", which causes
 *   the chip to render "GPU · ARRIVAL" — this is a factory quirk, not a component bug.
 *   Tests that need clean labels use `target: null` explicitly.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, within, userEvent } from "@/test/rtl";
import { ServiceChipRow } from "./ServiceChipRow";
import { makeService } from "@/test/factories";
import type { FlightViewService } from "@/types/v2";

// ---------------------------------------------------------------------------
// Helpers — override target to null so chips show clean labels without suffix
// ---------------------------------------------------------------------------

function makeArrivalService(overrides: Partial<FlightViewService> = {}) {
  return makeService({ target: null, ...overrides, direction: "ARRIVAL" });
}
function makeDepartureService(overrides: Partial<FlightViewService> = {}) {
  return makeService({ target: null, ...overrides, direction: "DEPARTURE" });
}
function makeBothService(overrides: Partial<FlightViewService> = {}) {
  return makeService({ target: null, ...overrides, direction: "BOTH" });
}

// ---------------------------------------------------------------------------
// 1. Render — all services shown regardless of direction
// ---------------------------------------------------------------------------

describe("ServiceChipRow — renders all services regardless of direction", () => {
  it("renders nothing when services is empty", () => {
    const { container } = render(<ServiceChipRow services={[]} />);
    expect(container.querySelector(".services-strip")).toBeNull();
  });

  it("renders a chip for an ARRIVAL-tagged service", () => {
    const { container } = render(
      <ServiceChipRow
        services={[makeArrivalService({ id: "s-arr", type: "GPU", state: "PENDING" })]}
      />
    );
    expect(container.querySelector(".services-strip")).not.toBeNull();
    // GPU renders its label ("GPU" is SERVICE_LABELS["GPU"])
    expect(screen.getByText("GPU")).toBeTruthy();
  });

  it("renders a chip for a DEPARTURE-tagged service", () => {
    render(
      <ServiceChipRow
        services={[makeDepartureService({ id: "s-dep", type: "CATERING", state: "PENDING" })]}
      />
    );
    expect(screen.getByText("Catering")).toBeTruthy();
  });

  it("renders a chip for a BOTH-tagged service", () => {
    render(
      <ServiceChipRow
        services={[makeBothService({ id: "s-both", type: "COOLER_BAG", state: "PENDING" })]}
      />
    );
    expect(screen.getByText("Bolsa nevera")).toBeTruthy();
  });

  it("renders ARRIVAL and DEPARTURE services together — no separation by direction", () => {
    const services = [
      makeArrivalService({ id: "s-gpu",  type: "GPU",     state: "PENDING" }),
      makeDepartureService({ id: "s-cat", type: "CATERING", state: "DELIVERED" }),
    ];
    const { container } = render(<ServiceChipRow services={services} />);
    const strip = container.querySelector(".services-strip") as HTMLElement;
    // Both chips are inside the same strip element — no sub-sections
    expect(within(strip).getByText("GPU")).toBeTruthy();
    expect(within(strip).getByText("Catering")).toBeTruthy();
    // Only one .services-strip — no direction-based sub-groups
    expect(container.querySelectorAll(".services-strip")).toHaveLength(1);
  });

  it("three services of mixed directions all render in a single flat strip", () => {
    const services = [
      makeArrivalService({ id: "s1", type: "WATER",   state: "PENDING" }),
      makeDepartureService({ id: "s2", type: "CATERING", state: "ARRIVED" }),
      makeBothService({ id: "s3", type: "LAUNDRY", state: "DELIVERED" }),
    ];
    const { container } = render(<ServiceChipRow services={services} />);
    const strip = container.querySelector(".services-strip") as HTMLElement;
    const buttons = within(strip).getAllByRole("button");
    // All 3 services render as chip buttons in the same strip
    expect(buttons).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// 2. Delivered counter — counts active services regardless of direction
//
// "X/Y servidos" counter: Y = active (non-cancelled), X = delivered.
// Both ARRIVAL and DEPARTURE services contribute to the same counter.
// ---------------------------------------------------------------------------

describe("ServiceChipRow — delivered counter is direction-agnostic", () => {
  it("counter shows 0/2 when an ARRIVAL + DEPARTURE service are both PENDING", () => {
    const services = [
      makeArrivalService({ id: "s1", type: "GPU",     state: "PENDING" }),
      makeDepartureService({ id: "s2", type: "CATERING", state: "PENDING" }),
    ];
    const { container } = render(<ServiceChipRow services={services} />);
    expect(container.textContent).toMatch(/0\/2 servidos/);
  });

  it("counter shows 1/2 when only the DEPARTURE catering is delivered", () => {
    const services = [
      makeArrivalService({ id: "s1", type: "GPU",     state: "PENDING" }),
      makeDepartureService({ id: "s2", type: "CATERING", state: "DELIVERED" }),
    ];
    const { container } = render(<ServiceChipRow services={services} />);
    expect(container.textContent).toMatch(/1\/2 servidos/);
  });

  it("counter shows 2/2 when both ARRIVAL and DEPARTURE services are delivered", () => {
    const services = [
      makeArrivalService({ id: "s1", type: "GPU",     state: "DELIVERED" }),
      makeDepartureService({ id: "s2", type: "CATERING", state: "DELIVERED" }),
    ];
    const { container } = render(<ServiceChipRow services={services} />);
    expect(container.textContent).toMatch(/2\/2 servidos/);
  });

  it("CANCELLED services are excluded from the active (Y) count", () => {
    // active = filter(state !== CANCELLED).length
    const services = [
      makeDepartureService({ id: "s1", type: "CATERING", state: "DELIVERED" }),
      makeDepartureService({ id: "s2", type: "DISHES",   state: "CANCELLED" }),
      makeArrivalService({ id: "s3", type: "GPU",     state: "PENDING" }),
    ];
    const { container } = render(<ServiceChipRow services={services} />);
    // active = 2 (CANCELLED excluded), delivered = 1
    expect(container.textContent).toMatch(/1\/2 servidos/);
  });
});

// ---------------------------------------------------------------------------
// 3. Two caterings with different directions — both chips visible
//
// This is the core "ARRIVAL + DEPARTURE catering" scenario. The strip shows
// both chips without any visual distinction by direction.
//
// DESIGN NOTE: The `direction` field is NOT rendered as a visible label.
// The `target` field (CREW/PAX) IS rendered as a suffix when non-null.
// ---------------------------------------------------------------------------

describe("ServiceChipRow — two CATERING services (ARRIVAL + DEPARTURE)", () => {
  it("renders two Catering chips when a visit has both an ARRIVAL and DEPARTURE catering", () => {
    const services = [
      // Use explicit target to distinguish the two chips visually
      makeArrivalService({ id: "s-crew", type: "CATERING", state: "PENDING",   target: "CREW" }),
      makeDepartureService({ id: "s-pax",  type: "CATERING", state: "DELIVERED", target: "PAX" }),
    ];
    const { container } = render(<ServiceChipRow services={services} />);
    const strip = container.querySelector(".services-strip") as HTMLElement;
    const buttons = within(strip).getAllByRole("button");
    // Both chips are rendered — no deduplication or filtering by direction
    expect(buttons).toHaveLength(2);
  });

  it("counter reflects both caterings: 1/2 servidos when only one is delivered", () => {
    const services = [
      makeArrivalService({ id: "s-crew", type: "CATERING", state: "PENDING",   target: "CREW" }),
      makeDepartureService({ id: "s-pax",  type: "CATERING", state: "DELIVERED", target: "PAX" }),
    ];
    const { container } = render(<ServiceChipRow services={services} />);
    expect(container.textContent).toMatch(/1\/2 servidos/);
  });

  it("direction field is NOT rendered as a visible label — only target (CREW/PAX) appears as suffix", () => {
    // The chip renders: `{baseLabel}{targetSuffix}` where targetSuffix = ` · Crew` or ` · Pax`
    // The `direction` field (ARRIVAL/DEPARTURE/BOTH) does NOT appear anywhere in the chip text.
    // Only `target` (which is a separate field for CREW/PAX) appears as a suffix.
    const services = [
      // target:null → no suffix at all; direction:ARRIVAL → not rendered
      makeArrivalService({ id: "s1", type: "GPU", state: "PENDING", target: null }),
    ];
    const { container } = render(<ServiceChipRow services={services} />);
    // The chip text content should be "GPU" + state, with no direction label
    const strip = container.querySelector(".services-strip") as HTMLElement;
    const chip = within(strip).getAllByRole("button")[0];
    expect(chip.textContent).not.toMatch(/ARRIVAL/);
    expect(chip.textContent).not.toMatch(/DEPARTURE/);
    expect(chip.textContent).not.toMatch(/BOTH/);
  });

  it("both caterings appear in aria-labels; target distinguishes them", () => {
    const services = [
      makeArrivalService({ id: "s-crew", type: "CATERING", state: "PENDING",   target: "CREW" }),
      makeDepartureService({ id: "s-pax",  type: "CATERING", state: "DELIVERED", target: "PAX" }),
    ];
    const { container } = render(<ServiceChipRow services={services} />);
    // The aria-labels surface target (Crew/Pax) to differentiate the chips
    const buttons = container.querySelectorAll(".services-strip button");
    const labels = Array.from(buttons).map((b) => b.getAttribute("aria-label") ?? "");
    const hasCrew = labels.some((l) => l.includes("Crew"));
    const hasPax  = labels.some((l) => l.includes("Pax"));
    expect(hasCrew).toBe(true);
    expect(hasPax).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. Toggle — fires onToggle with service id and next state for any direction
// ---------------------------------------------------------------------------

describe("ServiceChipRow — onToggle fires for any direction service", () => {
  it("cycling an ARRIVAL service fires onToggle correctly", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const services = [makeArrivalService({ id: "s-gpu", type: "GPU", state: "PENDING" })];
    const { container } = render(
      <ServiceChipRow services={services} onToggle={onToggle} />
    );
    const strip = container.querySelector(".services-strip") as HTMLElement;
    await user.click(within(strip).getAllByRole("button")[0]);
    expect(onToggle).toHaveBeenCalledWith("s-gpu", "ARRIVED");
  });

  it("cycling a DEPARTURE service fires onToggle correctly", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const services = [makeDepartureService({ id: "s-cat", type: "CATERING", state: "ARRIVED" })];
    const { container } = render(
      <ServiceChipRow services={services} onToggle={onToggle} />
    );
    const strip = container.querySelector(".services-strip") as HTMLElement;
    await user.click(within(strip).getAllByRole("button")[0]);
    expect(onToggle).toHaveBeenCalledWith("s-cat", "DELIVERED");
  });
});
