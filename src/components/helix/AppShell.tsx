"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ReactNode, Suspense } from "react";
import { useSession, signOut } from "next-auth/react";
import { HelixHeader, HeaderTab } from "./AppHeader";
import { HelixFooter } from "./AppFooter";
import { useDate } from "./useDate";

const TABS: Array<{ href: string; label: string; icon?: ReactNode }> = [
  { href: "/", label: "Lista", icon: "▤" },
  { href: "/dia", label: "Tablón", icon: "⊞" },
  { href: "/timeline", label: "Timeline", icon: "▭" },
  { href: "/metrics", label: "Métricas", icon: "◷" },
  { href: "/historico", label: "Histórico", icon: "◰" },
];

const CHROMELESS_PREFIXES = ["/login", "/admin"];

function initialsOf(name?: string | null) {
  if (!name) return "··";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "··";
}

function formatDate(d: Date) {
  return d.toLocaleDateString("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function AppShellInner({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/dia";
  const router = useRouter();
  const params = useSearchParams();
  const { data: session } = useSession();
  const { date, isToday, shift, goToday } = useDate();

  if (CHROMELESS_PREFIXES.some((p) => pathname.startsWith(p))) {
    return <>{children}</>;
  }

  // Preserve ?d=YYYY-MM-DD across tab navigation so the operator doesn't
  // have to re-pick the date every time they switch views.
  const carry = params?.toString() ?? "";
  const withQuery = (href: string) => (carry ? `${href}?${carry}` : href);

  const tabs: HeaderTab[] = TABS.map((t) => ({
    ...t,
    href: withQuery(t.href),
    active: t.href === "/" ? pathname === "/" : pathname.startsWith(t.href),
  }));

  const userName = session?.user?.name ?? null;
  const role = session?.user?.role;

  return (
    <div className="flex min-h-screen flex-col">
      <HelixHeader
        tabs={tabs}
        date={{
          label: formatDate(date),
          onPrev: () => shift(-1),
          onNext: () => shift(1),
          onToday: goToday,
          isToday,
          live: true,
        }}
        user={
          userName
            ? {
                initials: initialsOf(userName),
                name: userName,
                role: role ? String(role).toLowerCase() : undefined,
                isAdmin: role === "ADMIN",
                onAdmin: () => router.push("/admin"),
                onLogout: () => signOut(),
              }
            : undefined
        }
      />
      <main className="flex-1">{children}</main>
      <HelixFooter
        shortcuts={<span className="mono">←→ fecha · T hoy · / buscar · ? ayuda</span>}
        version="Helix v1.0 · Mallorcair LEPA"
      />
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  // useSearchParams inside useDate requires a Suspense boundary.
  return (
    <Suspense fallback={<>{children}</>}>
      <AppShellInner>{children}</AppShellInner>
    </Suspense>
  );
}
