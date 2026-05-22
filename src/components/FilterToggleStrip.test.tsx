// @vitest-environment happy-dom

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@/test/rtl";
import { FilterToggleStrip } from "./FilterToggleStrip";

describe("FilterToggleStrip", () => {
  it("renders all three chips when showNext8h is true", () => {
    render(
      <FilterToggleStrip
        pendingOnly={false}
        next8h={false}
        hideCancelled={false}
        showNext8h={true}
        onChange={() => undefined}
      />,
    );
    expect(screen.getByRole("button", { name: /Solo pendientes/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Próximas 8h/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Ocultar cancelados/ })).toBeTruthy();
  });

  it("hides the next-8h chip when showNext8h is false but keeps the others", () => {
    render(
      <FilterToggleStrip
        pendingOnly={false}
        next8h={false}
        hideCancelled={false}
        showNext8h={false}
        onChange={() => undefined}
      />,
    );
    expect(screen.getByRole("button", { name: /Solo pendientes/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Próximas 8h/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Ocultar cancelados/ })).toBeTruthy();
  });

  it("clicking 'Solo pendientes' flips its value", () => {
    const onChange = vi.fn();
    render(
      <FilterToggleStrip
        pendingOnly={false}
        next8h={false}
        hideCancelled={false}
        showNext8h={true}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Solo pendientes/ }));
    expect(onChange).toHaveBeenCalledWith({
      pendingOnly: true,
      next8h: false,
      hideCancelled: false,
    });
  });

  it("clicking 'Próximas 8h' flips its value", () => {
    const onChange = vi.fn();
    render(
      <FilterToggleStrip
        pendingOnly={true}
        next8h={false}
        hideCancelled={false}
        showNext8h={true}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Próximas 8h/ }));
    expect(onChange).toHaveBeenCalledWith({
      pendingOnly: true,
      next8h: true,
      hideCancelled: false,
    });
  });

  it("clicking 'Ocultar cancelados' flips its value and preserves the others", () => {
    const onChange = vi.fn();
    render(
      <FilterToggleStrip
        pendingOnly={true}
        next8h={true}
        hideCancelled={false}
        showNext8h={true}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Ocultar cancelados/ }));
    expect(onChange).toHaveBeenCalledWith({
      pendingOnly: true,
      next8h: true,
      hideCancelled: true,
    });
  });

  it("shows pending count when > 0", () => {
    render(
      <FilterToggleStrip
        pendingOnly={false}
        next8h={false}
        hideCancelled={false}
        showNext8h={true}
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
        next8h={false}
        hideCancelled={false}
        showNext8h={true}
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
        next8h={false}
        hideCancelled={false}
        showNext8h={true}
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
        next8h={false}
        hideCancelled={true}
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
    expect(
      screen.getByRole("button", { name: /Ocultar cancelados/ }).getAttribute("aria-pressed"),
    ).toBe("true");
  });
});
