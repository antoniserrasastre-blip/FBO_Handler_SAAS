// @vitest-environment happy-dom

import { describe, it, expect } from "vitest";
import { render } from "@/test/rtl";
import { PetCount } from "./PetCount";

describe("PetCount", () => {
  it("renders nothing when the count is zero or negative", () => {
    // Cards with no pets must not show a "0 mascotas" pill — that would be
    // visual noise on >90% of flights. The component should disappear.
    const { container: zero } = render(<PetCount count={0} />);
    const { container: neg } = render(<PetCount count={-1} />);
    expect(zero.firstChild).toBeNull();
    expect(neg.firstChild).toBeNull();
  });

  it("surfaces the count and a screen-reader title when there are pets", () => {
    // The handler needs to know how many crates to expect, and the count
    // must be reachable by screen readers / hover tooltip. Title attribute
    // is the lightweight contract.
    const { getByTitle, container } = render(<PetCount count={3} />);
    expect(getByTitle(/3 mascotas/i)).toBeTruthy();
    expect(container.textContent).toContain("3");
  });

  it("uses the singular form for a single pet", () => {
    // i18n correctness — "1 mascotas" reads wrong; spec says "1 mascota".
    const { getByTitle } = render(<PetCount count={1} />);
    expect(getByTitle("1 mascota")).toBeTruthy();
  });
});
