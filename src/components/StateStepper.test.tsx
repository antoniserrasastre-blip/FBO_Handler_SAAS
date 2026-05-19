// @vitest-environment happy-dom

import { describe, it, expect, vi } from "vitest";
import { render, screen, userEvent } from "@/test/rtl";
import { StateStepper } from "./StateStepper";

describe("StateStepper", () => {
  it("renders one chip per flight state in chronological order", () => {
    const { container } = render(<StateStepper value="EXPECTED" onChange={() => undefined} />);
    const chips = container.querySelectorAll('[role="radio"]');
    expect(chips).toHaveLength(6);
    // First chip is EXPECTED, last is OFF_BLOCKS
    expect(chips[0].textContent).toMatch(/esperado/i);
    expect(chips[5].textContent).toMatch(/despegó/i);
  });

  it("marks the chip whose state matches value as current (aria-checked)", () => {
    render(<StateStepper value="PARKED" onChange={() => undefined} />);
    const parked = screen.getByRole("radio", { name: /plataforma/i });
    const expected = screen.getByRole("radio", { name: /esperado/i });
    expect(parked.getAttribute("aria-checked")).toBe("true");
    expect(expected.getAttribute("aria-checked")).toBe("false");
  });

  it("tags chips before the current one as past", () => {
    render(<StateStepper value="TURNAROUND" onChange={() => undefined} />);
    expect(screen.getByRole("radio", { name: /esperado/i }).getAttribute("data-position")).toBe("past");
    expect(screen.getByRole("radio", { name: /calzos/i }).getAttribute("data-position")).toBe("past");
    expect(screen.getByRole("radio", { name: /plataforma/i }).getAttribute("data-position")).toBe("past");
  });

  it("tags chips after the current one as future", () => {
    render(<StateStepper value="ON_BLOCKS" onChange={() => undefined} />);
    expect(screen.getByRole("radio", { name: /plataforma/i }).getAttribute("data-position")).toBe("future");
    expect(screen.getByRole("radio", { name: /despegó/i }).getAttribute("data-position")).toBe("future");
  });

  it("tags the matching chip as current", () => {
    render(<StateStepper value="BOARDING" onChange={() => undefined} />);
    expect(screen.getByRole("radio", { name: /boarding/i }).getAttribute("data-position")).toBe("current");
  });

  it("fires onChange with the state when a non-current chip is tapped", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<StateStepper value="EXPECTED" onChange={onChange} />);
    await user.click(screen.getByRole("radio", { name: /calzos/i }));
    expect(onChange).toHaveBeenCalledWith("ON_BLOCKS");
  });

  it("can advance to a future state (forward) and revert to a past state (backward)", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<StateStepper value="TURNAROUND" onChange={onChange} />);
    await user.click(screen.getByRole("radio", { name: /boarding/i }));
    await user.click(screen.getByRole("radio", { name: /calzos/i }));
    expect(onChange).toHaveBeenNthCalledWith(1, "BOARDING");
    expect(onChange).toHaveBeenNthCalledWith(2, "ON_BLOCKS");
  });

  it("does NOT fire onChange when the current chip is tapped", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<StateStepper value="EXPECTED" onChange={onChange} />);
    await user.click(screen.getByRole("radio", { name: /esperado/i }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ignores clicks when disabled", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<StateStepper value="EXPECTED" onChange={onChange} disabled />);
    await user.click(screen.getByRole("radio", { name: /calzos/i }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("groups the chips under role=radiogroup with an accessible label", () => {
    render(<StateStepper value="EXPECTED" onChange={() => undefined} />);
    const group = screen.getByRole("radiogroup");
    expect(group).toBeTruthy();
    expect(group.getAttribute("aria-label")).toMatch(/estado/i);
  });

  it("does not bubble clicks to the parent card", async () => {
    const onParentClick = vi.fn();
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <div onClick={onParentClick}>
        <StateStepper value="EXPECTED" onChange={onChange} />
      </div>
    );
    await user.click(screen.getByRole("radio", { name: /calzos/i }));
    expect(onChange).toHaveBeenCalled();
    expect(onParentClick).not.toHaveBeenCalled();
  });
});
