// @vitest-environment happy-dom

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@/test/rtl";
import { FilterToggleStrip } from "./FilterToggleStrip";

describe("FilterToggleStrip", () => {
  it("renders all three chips when showNextHours is true", () => {
    render(
      <FilterToggleStrip
        pendingOnly={false}
        nextHours={0}
        hideCancelled={false}
        showNextHours={true}
        onChange={() => undefined}
      />,
    );
    expect(screen.getByRole("button", { name: /Solo pendientes/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Filtrar a próximas/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Ocultar cancelados/ })).toBeTruthy();
  });

  it("hides the next-hours chip when showNextHours is false but keeps the others", () => {
    render(
      <FilterToggleStrip
        pendingOnly={false}
        nextHours={0}
        hideCancelled={false}
        showNextHours={false}
        onChange={() => undefined}
      />,
    );
    expect(screen.getByRole("button", { name: /Solo pendientes/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Filtrar a próximas/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Ocultar cancelados/ })).toBeTruthy();
  });

  it("clicking 'Solo pendientes' flips its value", () => {
    const onChange = vi.fn();
    render(
      <FilterToggleStrip
        pendingOnly={false}
        nextHours={0}
        hideCancelled={false}
        showNextHours={true}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Solo pendientes/ }));
    expect(onChange).toHaveBeenCalledWith({
      pendingOnly: true,
      nextHours: 0,
      hideCancelled: false,
      mineOnly: false,
    });
  });

  it("clicking the time-window chip from OFF advances to 4h", () => {
    const onChange = vi.fn();
    render(
      <FilterToggleStrip
        pendingOnly={true}
        nextHours={0}
        hideCancelled={false}
        showNextHours={true}
        onChange={onChange}
      />,
    );
    // OFF state shows the default "Próximas 8h" label.
    expect(
      screen.getByRole("button", { name: /Filtrar a próximas/ }).textContent,
    ).toMatch(/Próximas 8h/);
    fireEvent.click(screen.getByRole("button", { name: /Filtrar a próximas/ }));
    expect(onChange).toHaveBeenCalledWith({
      pendingOnly: true,
      nextHours: 4,
      hideCancelled: false,
      mineOnly: false,
    });
  });

  it("clicking the time-window chip from 4h advances to 8h", () => {
    const onChange = vi.fn();
    render(
      <FilterToggleStrip
        pendingOnly={false}
        nextHours={4}
        hideCancelled={false}
        showNextHours={true}
        onChange={onChange}
      />,
    );
    const chip = screen.getByRole("button", { name: /Filtrar a próximas 4/ });
    expect(chip.textContent).toMatch(/Próximas 4h/);
    fireEvent.click(chip);
    expect(onChange).toHaveBeenCalledWith({
      pendingOnly: false,
      nextHours: 8,
      hideCancelled: false,
      mineOnly: false,
    });
  });

  it("renders the cyclic stepper affordance (3 pips) on the time-window chip", () => {
    render(
      <FilterToggleStrip
        pendingOnly={false}
        nextHours={4}
        hideCancelled={false}
        showNextHours={true}
        onChange={() => undefined}
      />,
    );
    const chip = screen.getByRole("button", { name: /Filtrar a próximas 4/ });
    // Three cycle pips (OFF · 4h · 8h) marked aria-hidden — proves the chip
    // reads as a stepper, not a plain on/off toggle.
    const pips = chip.querySelectorAll("span[aria-hidden] > span");
    expect(pips.length).toBe(3);
  });

  it("clicking the time-window chip from 8h cycles back to OFF", () => {
    const onChange = vi.fn();
    render(
      <FilterToggleStrip
        pendingOnly={false}
        nextHours={8}
        hideCancelled={false}
        showNextHours={true}
        onChange={onChange}
      />,
    );
    const chip = screen.getByRole("button", { name: /Filtrar a próximas 8/ });
    expect(chip.textContent).toMatch(/Próximas 8h/);
    fireEvent.click(chip);
    expect(onChange).toHaveBeenCalledWith({
      pendingOnly: false,
      nextHours: 0,
      hideCancelled: false,
      mineOnly: false,
    });
  });

  it("clicking 'Ocultar cancelados' flips its value and preserves the others", () => {
    const onChange = vi.fn();
    render(
      <FilterToggleStrip
        pendingOnly={true}
        nextHours={4}
        hideCancelled={false}
        showNextHours={true}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Ocultar cancelados/ }));
    expect(onChange).toHaveBeenCalledWith({
      pendingOnly: true,
      nextHours: 4,
      hideCancelled: true,
      mineOnly: false,
    });
  });

  it("shows pending count when > 0", () => {
    render(
      <FilterToggleStrip
        pendingOnly={false}
        nextHours={0}
        hideCancelled={false}
        showNextHours={true}
        pendingCount={4}
        onChange={() => undefined}
      />,
    );
    expect(screen.getByRole("button", { name: /Solo pendientes/ }).textContent).toMatch(/4/);
  });

  it("shows cancelled count when > 0", () => {
    render(
      <FilterToggleStrip
        pendingOnly={false}
        nextHours={0}
        hideCancelled={false}
        showNextHours={true}
        hideCancelledCount={2}
        onChange={() => undefined}
      />,
    );
    expect(screen.getByRole("button", { name: /Ocultar cancelados/ }).textContent).toMatch(/2/);
  });

  it("hides cancelled count badge when 0", () => {
    render(
      <FilterToggleStrip
        pendingOnly={false}
        nextHours={0}
        hideCancelled={false}
        showNextHours={true}
        hideCancelledCount={0}
        onChange={() => undefined}
      />,
    );
    expect(
      screen.getByRole("button", { name: /Ocultar cancelados/ }).textContent,
    ).not.toMatch(/·/);
  });

  it("aria-pressed reflects active state on all chips", () => {
    render(
      <FilterToggleStrip
        pendingOnly={true}
        nextHours={0}
        hideCancelled={true}
        showNextHours={true}
        onChange={() => undefined}
      />,
    );
    expect(
      screen.getByRole("button", { name: /Solo pendientes/ }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: /Filtrar a próximas/ }).getAttribute("aria-pressed"),
    ).toBe("false");
    expect(
      screen.getByRole("button", { name: /Ocultar cancelados/ }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("aria-pressed is true when nextHours > 0", () => {
    render(
      <FilterToggleStrip
        pendingOnly={false}
        nextHours={4}
        hideCancelled={false}
        showNextHours={true}
        onChange={() => undefined}
      />,
    );
    expect(
      screen.getByRole("button", { name: /Filtrar a próximas 4/ }).getAttribute("aria-pressed"),
    ).toBe("true");
  });
});
