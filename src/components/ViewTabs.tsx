"use client";

import { usePathname, useRouter } from "next/navigation";
import { LayoutGrid, Table, BarChart3, LineChart } from "lucide-react";

const TABS = [
  { href: "/", label: "Lista", Icon: LayoutGrid },
  { href: "/dia", label: "Tablon", Icon: Table },
  { href: "/timeline", label: "Timeline", Icon: BarChart3 },
  { href: "/metrics", label: "Metricas", Icon: LineChart },
] as const;

/**
 * Switcher horizontal entre las vistas operacionales. Diseñado para vivir
 * en el header de cada una. Tono dark para headers oscuros, light para claros.
 */
export function ViewTabs({ tone = "light" }: { tone?: "light" | "dark" }) {
  const pathname = usePathname();
  const router = useRouter();

  const isDark = tone === "dark";
  const wrapCls = isDark
    ? "inline-flex items-center gap-0.5 rounded-lg bg-[#161616] p-[3px]"
    : "inline-flex items-center gap-0.5 rounded-lg bg-gray-100 p-0.5";

  return (
    <nav className={wrapCls}>
      {TABS.map(({ href, label, Icon }) => {
        const active = pathname === href || (href !== "/" && pathname?.startsWith(href));
        const baseCls = "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors";
        const activeCls = isDark
          ? "bg-[#3b3949] text-white font-semibold"
          : "bg-white text-gray-900 shadow-sm";
        const idleCls = isDark
          ? "text-gray-400 hover:text-white"
          : "text-gray-500 hover:text-gray-900";
        return (
          <button
            key={href}
            type="button"
            onClick={() => router.push(href)}
            className={`${baseCls} ${active ? activeCls : idleCls}`}
            title={label}
          >
            <Icon size={11} className={active && isDark ? "text-amber-400" : ""} />
            <span className="hidden sm:inline">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
