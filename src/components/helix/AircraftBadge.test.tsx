// @vitest-environment happy-dom

import { describe, it, expect, vi } from "vitest";
import { render, screen, userEvent } from "@/test/rtl";
import { AircraftBadge } from "./AircraftBadge";

describe("AircraftBadge", () => {
  it("shows the registration even without an aircraft type", () => {
    // Type field is best-effort metadata; registration is the primary key
    // — it must always render.
    render(<AircraftBadge registration="CS-DXX" />);
    expect(screen.getByText("CS-DXX")).toBeTruthy();
  });

  it("appends the aircraft type when available", () => {
    // Handlers cross-check registration vs type to spot mis-imports (e.g.
    // a re-registered hull); the type next to the reg makes that obvious.
    const { container } = render(
      <AircraftBadge registration="CS-DXX" aircraftType="GLEX" />
    );
    expect(container.textContent).toContain("CS-DXX");
    expect(container.textContent).toContain("GLEX");
  });

  it("falls back to em-dash when registration is empty", () => {
    // Missing reg is data loss — show it as missing rather than rendering
    // an empty pill that looks like an artifact.
    render(<AircraftBadge registration="" />);
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("fires onSelectRegistration with the reg when clicked", async () => {
    // Card click contract — pivot the search bar to this registration.
    const onSelect = vi.fn();
    render(
      <AircraftBadge registration="9H-VJZ" onSelectRegistration={onSelect} />
    );
    await userEvent.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledWith("9H-VJZ");
  });

  it("does not propagate the click to the surrounding card", async () => {
    const onSelect = vi.fn();
    const onCardClick = vi.fn();
    render(
      <div onClick={onCardClick}>
        <AircraftBadge registration="9H-VJZ" onSelectRegistration={onSelect} />
      </div>
    );
    await userEvent.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onCardClick).not.toHaveBeenCalled();
  });

  it("is keyboard-activatable (Enter triggers the filter)", async () => {
    // a11y — handler on keyboard-only workflow must be able to tab to the
    // chip and press Enter to filter.
    const onSelect = vi.fn();
    render(
      <AircraftBadge registration="D-AAAA" onSelectRegistration={onSelect} />
    );
    const btn = screen.getByRole("button");
    btn.focus();
    await userEvent.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith("D-AAAA");
  });

  it("renders a plain span (no button) in read-only mode", () => {
    render(<AircraftBadge registration="CS-DXX" />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
