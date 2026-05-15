// @vitest-environment happy-dom

import { describe, it, expect } from "vitest";
import { render } from "@/test/rtl";
import { CategoryPill } from "./CategoryPill";

describe("CategoryPill", () => {
  it("renders nothing for the default COMMERCIAL category without modifications", () => {
    // 95% of flights are unmodified commercial — the card hero must not be
    // polluted by a "COMMERCIAL" badge that adds nothing.
    const { container } = render(<CategoryPill category="COMMERCIAL" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders a loud FERRY pill when the flight is repositioning empty", () => {
    // Ferry legs change priority decisions (no pax services, fuel only,
    // can be deprioritised). The handler must spot it instantly.
    const { getByText } = render(<CategoryPill category="FERRY" />);
    expect(getByText(/ferry/i)).toBeTruthy();
  });

  it("renders a struck-through CANCELADO pill for cancelled flights", () => {
    // Cancelled is loud + struck — the handler sees both colour and a visual
    // strikethrough cue so they don't service a flight that's no longer due.
    const { getByText } = render(<CategoryPill category="CANCELLED" />);
    const pill = getByText(/cancelado/i);
    expect(pill).toBeTruthy();
    expect(pill.className).toMatch(/hx-pill-cancelled/);
  });

  it("adds a modified marker on top of any category, including COMMERCIAL", () => {
    // ALS sends MODIFIED flags when ETA/ETD changes mid-day. The marker is
    // additive — the underlying category still drives colour, but the star
    // tells the handler "something changed since last refresh".
    const { getByText } = render(
      <CategoryPill category="COMMERCIAL" modified />
    );
    expect(getByText(/modificado/i)).toBeTruthy();
  });

  it("shows both FERRY and modified marker when both apply", () => {
    // A ferry can also be retimed; both pills should coexist.
    const { getByText } = render(<CategoryPill category="FERRY" modified />);
    expect(getByText(/ferry/i)).toBeTruthy();
    expect(getByText(/modificado/i)).toBeTruthy();
  });
});
