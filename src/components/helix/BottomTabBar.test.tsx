// @vitest-environment happy-dom

import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/rtl";
import { BottomTabBar } from "./BottomTabBar";
import type { HeaderTab } from "./AppHeader";

const tabs: HeaderTab[] = [
  { href: "/", label: "Lista", icon: "▤", active: true },
  { href: "/dia", label: "Tablón", icon: "⊞" },
  { href: "/timeline", label: "Timeline", icon: "▭" },
];

describe("BottomTabBar", () => {
  it("renders every tab passed in", () => {
    render(<BottomTabBar tabs={tabs} />);
    expect(screen.getByRole("link", { name: /lista/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /tablón/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /timeline/i })).toBeTruthy();
  });

  it("marks the active tab", () => {
    const { container } = render(<BottomTabBar tabs={tabs} />);
    const active = container.querySelector("a.on");
    expect(active?.textContent).toMatch(/lista/i);
  });

  it("is positioned fixed at the bottom (mobile-friendly)", () => {
    const { container } = render(<BottomTabBar tabs={tabs} />);
    const nav = container.querySelector("nav");
    expect(nav?.className).toMatch(/fixed/);
    expect(nav?.className).toMatch(/bottom/);
  });
});
