// @vitest-environment happy-dom

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@/test/rtl";
import { ShiftQueueToggle } from "./ShiftQueueToggle";

describe("ShiftQueueToggle", () => {
  it("renders both segments with posts label and queue count", () => {
    render(
      <ShiftQueueToggle
        active={true}
        onChange={() => undefined}
        postsLabel="Rampa, Llegadas"
        queueCount={5}
      />,
    );
    const queue = screen.getByRole("button", { name: /Mi cola/ });
    const all = screen.getByRole("button", { name: /Toda la jornada/ });
    expect(queue.textContent).toMatch(/Mi cola/);
    expect(queue.textContent).toMatch(/5/);
    expect(queue.textContent).toMatch(/Rampa, Llegadas/);
    expect(all).toBeTruthy();
  });

  it("marks the active segment via aria-pressed (queue active)", () => {
    render(
      <ShiftQueueToggle
        active={true}
        onChange={() => undefined}
        postsLabel="Rampa"
        queueCount={2}
      />,
    );
    expect(
      screen.getByRole("button", { name: /Mi cola/ }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: /Toda la jornada/ }).getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("marks the active segment via aria-pressed (full day active)", () => {
    render(
      <ShiftQueueToggle
        active={false}
        onChange={() => undefined}
        postsLabel="Rampa"
        queueCount={2}
      />,
    );
    expect(
      screen.getByRole("button", { name: /Mi cola/ }).getAttribute("aria-pressed"),
    ).toBe("false");
    expect(
      screen.getByRole("button", { name: /Toda la jornada/ }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("clicking 'Mi cola' reports active=true", () => {
    const onChange = vi.fn();
    render(
      <ShiftQueueToggle
        active={false}
        onChange={onChange}
        postsLabel="Rampa"
        queueCount={3}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Mi cola/ }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("clicking 'Toda la jornada' reports active=false", () => {
    const onChange = vi.fn();
    render(
      <ShiftQueueToggle
        active={true}
        onChange={onChange}
        postsLabel="Rampa"
        queueCount={3}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Toda la jornada/ }));
    expect(onChange).toHaveBeenCalledWith(false);
  });
});
