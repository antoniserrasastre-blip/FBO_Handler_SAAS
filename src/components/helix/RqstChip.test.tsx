// @vitest-environment happy-dom

import { describe, it, expect } from "vitest";
import { render } from "@/test/rtl";
import { RqstChip } from "./RqstChip";

describe("RqstChip", () => {
  it("renders nothing when no order number is provided", () => {
    // Manual flights and non-NetJets visits don't carry an ALS order number;
    // the chip must vanish, not show "#" or "#null".
    const { container: nullCase } = render(<RqstChip rqstNumber={null} />);
    const { container: undef } = render(<RqstChip />);
    const { container: empty } = render(<RqstChip rqstNumber="" />);
    expect(nullCase.firstChild).toBeNull();
    expect(undef.firstChild).toBeNull();
    expect(empty.firstChild).toBeNull();
  });

  it("prefixes the order number with # and exposes it as a hover hint", () => {
    // The handler reads the rqst on the radio; the "#" tells you it's an
    // order, and the title gives the operator context ("Orden NJE …").
    const { container, getByTitle } = render(<RqstChip rqstNumber="P-12345" />);
    expect(container.textContent).toBe("#P-12345");
    expect(getByTitle(/orden nje p-12345/i)).toBeTruthy();
  });
});
