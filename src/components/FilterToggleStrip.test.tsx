// @vitest-environment happy-dom

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@/test/rtl";
import { FilterToggleStrip } from "./FilterToggleStrip";

describe("FilterToggleStrip", () => {
  it("renders both chips when showNext8h is true", () => {
    render(
      <FilterToggleStrip
        pendingOnly={false}
        next8h={false}
        showNext8h={true}
        onChange={() => undefined}
      />,
    );
    expect(screen.getByRole("button", { name: /Solo pendientes/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Próximas 8h/ })).toBeTruthy();
  });

  it("hides the next-8h chip when showNext8h is false", () => {
    render(
      <FilterToggleStrip
        pendingOnly={false}
        next8h={false}
        showNext8h={false}
        onChange={() => undefined}
      />,
    );
    expect(screen.getByRole("button", { name: /Solo pendientes/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Próximas 8h/ })).toBeNull();
  });

  it("clicking 'Solo pendientes' flips its value", () => {
    const onChange = vi.fn();
    render(
      <FilterToggleStrip
        pendingOnly={false}
        next8h={false}
        showNext8h={true}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Solo pendientes/ }));
    expect(onChange).toHaveBeenCalledWith({ pendingOnly: true, next8h: false });
  });

  it("clicking 'Próximas 8h' flips its value", () => {
    const onChange = vi.fn();
    render(
      <FilterToggleStrip
        pendingOnly={true}
        next8h={false}
        showNext8h={true}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Próximas 8h/ }));
    expect(onChange).toHaveBeenCalledWith({ pendingOnly: true, next8h: true });
  });

  it("shows pending count when > 0", () => {
    render(
      <FilterToggleStrip
        pendingOnly={false}
        next8h={false}
        showNext8h={true}
        pendingCount={4}
        onChange={() => undefined}
      />,
    );
    expect(screen.getByRole("button", { name: /Solo pendientes/ }).textContent).toMatch(/4/);
  });

  it("aria-pressed reflects active state", () => {
    render(
      <FilterToggleStrip
        pendingOnly={true}
        next8h={false}
        showNext8h={true}
        onChange={() => undefined}
      />,
    );
    expect(
      screen.getByRole("button", { name: /Solo pendientes/ }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: /Próximas 8h/ }).getAttribute("aria-pressed"),
    ).toBe("false");
  });
});
