// @vitest-environment happy-dom

import { describe, it, expect, vi, afterEach } from "vitest";
import { render } from "@/test/rtl";
import { HelixHeader, type HeaderTab } from "./AppHeader";

function installMatchMedia(isMobile: boolean) {
  const mql = {
    matches: isMobile,
    media: "(max-width: 640px)",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
  };
  Object.defineProperty(window, "matchMedia", {
    value: vi.fn().mockReturnValue(mql),
    configurable: true,
    writable: true,
  });
}

const tabs: HeaderTab[] = [
  { href: "/", label: "Lista", active: true },
  { href: "/dia", label: "Tablón" },
  { href: "/timeline", label: "Timeline" },
];

afterEach(() => {
  delete (window as unknown as { matchMedia?: unknown }).matchMedia;
});

describe("HelixHeader responsive", () => {
  it("desktop: renders the tabs nav inside the header", () => {
    installMatchMedia(false);
    const { container } = render(<HelixHeader tabs={tabs} />);
    expect(container.querySelector("header .hx-tabs")).not.toBeNull();
  });

  it("mobile: does NOT render the tabs nav inside the header (moved to bottom)", () => {
    installMatchMedia(true);
    const { container } = render(<HelixHeader tabs={tabs} />);
    expect(container.querySelector("header .hx-tabs")).toBeNull();
  });

  it("mobile: hides the clocks (Palma/Zulu)", () => {
    installMatchMedia(true);
    const { container } = render(<HelixHeader tabs={tabs} />);
    expect(container.querySelector(".hx-clocks")).toBeNull();
  });

  it("mobile: hides the brand-tag (client label)", () => {
    installMatchMedia(true);
    const { container } = render(<HelixHeader tabs={tabs} clientLabel="Mallorcair · LEPA" />);
    expect(container.querySelector(".brand-tag")).toBeNull();
  });

  it("desktop: shows clocks and brand-tag", () => {
    installMatchMedia(false);
    const { container } = render(<HelixHeader tabs={tabs} clientLabel="Mallorcair · LEPA" />);
    expect(container.querySelector(".hx-clocks")).not.toBeNull();
    expect(container.querySelector(".brand-tag")).not.toBeNull();
  });
});
