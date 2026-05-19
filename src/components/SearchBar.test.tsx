// @vitest-environment happy-dom

import { describe, it, expect, vi, afterEach } from "vitest";
import { render } from "@/test/rtl";
import { SearchBar } from "./SearchBar";

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

afterEach(() => {
  delete (window as unknown as { matchMedia?: unknown }).matchMedia;
});

describe("SearchBar mobile sticky", () => {
  it("mobile: outer container is sticky to top", () => {
    installMatchMedia(true);
    const { container } = render(
      <SearchBar
        flights={[]}
        onFilteredFlights={() => undefined}
        resultCount={0}
        totalCount={0}
        query=""
        onQueryChange={() => undefined}
      />
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).toMatch(/sticky/);
    expect(root.className).toMatch(/top-0/);
  });

  it("desktop: outer container is not sticky", () => {
    installMatchMedia(false);
    const { container } = render(
      <SearchBar
        flights={[]}
        onFilteredFlights={() => undefined}
        resultCount={0}
        totalCount={0}
        query=""
        onQueryChange={() => undefined}
      />
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).not.toMatch(/sticky/);
  });
});
