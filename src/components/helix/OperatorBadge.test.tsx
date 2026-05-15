// @vitest-environment happy-dom

import { describe, it, expect, vi } from "vitest";
import { render, screen, userEvent } from "@/test/rtl";
import { OperatorBadge } from "./OperatorBadge";

describe("OperatorBadge", () => {
  it("shows the ICAO code and the operator's full name for a known callsign", () => {
    // NJE123CK is a NetJets ALS callsign — the handler reads the full
    // company name to identify the visit even when the registration is
    // unfamiliar. ICAO stays mono for radio reference.
    render(<OperatorBadge callsign="NJE123CK" />);
    expect(screen.getByText("NJE")).toBeTruthy();
    expect(screen.getByText("NetJets Europe")).toBeTruthy();
  });

  it("renders something sensible for callsigns we don't recognise", () => {
    // Unknown private callsign — we still surface the ICAO prefix so the
    // handler isn't left with an empty chip. No name to show is acceptable.
    const { container } = render(<OperatorBadge callsign="XYZ999" />);
    expect(container.textContent).toContain("XYZ");
  });

  it("renders nothing if both callsign and ICAO are missing", () => {
    // Defensive: don't crash with an empty chip on flights without callsign.
    const { container } = render(<OperatorBadge callsign={null} icaoCode={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("acts as a clickable filter button when onSelect is provided", async () => {
    // Click should reach the parent's search filter; the user wants to
    // pivot to "all flights from this operator today".
    const onSelect = vi.fn();
    render(<OperatorBadge callsign="NJE123CK" onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledWith("NJE");
  });

  it("does not bubble the click up to the parent card", async () => {
    // Critical UX: clicking the operator chip inside a VisitCard must
    // filter, NOT open the card detail / select it. stopPropagation must
    // be wired.
    const onSelect = vi.fn();
    const onParentClick = vi.fn();
    render(
      <div onClick={onParentClick}>
        <OperatorBadge callsign="NJE123CK" onSelect={onSelect} />
      </div>
    );
    await userEvent.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onParentClick).not.toHaveBeenCalled();
  });

  it("falls back to a static span (no button role) when onSelect is omitted", () => {
    // Read-only contexts (printable day sheet, handover view) shouldn't
    // have phantom buttons.
    render(<OperatorBadge callsign="NJE123CK" />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
