"use client";

import Link from "next/link";
import type { HeaderTab } from "./AppHeader";

/** Bottom-of-screen tab bar for mobile. Renders one large touch target per
 *  tab; fixed to the bottom so it survives scroll. */
export function BottomTabBar({ tabs }: { tabs: HeaderTab[] }) {
  return (
    <nav
      role="tablist"
      className="hx-bottom-nav fixed bottom-0 left-0 right-0 z-30 flex border-t border-line bg-bg-subtle"
    >
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium text-ink-3 ${t.active ? "on text-brand" : ""}`}
          aria-current={t.active ? "page" : undefined}
        >
          {t.icon ? <span className="text-base leading-none">{t.icon}</span> : null}
          <span>{t.label}</span>
        </Link>
      ))}
    </nav>
  );
}
