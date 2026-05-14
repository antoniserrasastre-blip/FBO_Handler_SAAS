"use client";

import Link from "next/link";
import { ReactNode, useEffect, useRef, useState } from "react";
import { HelixLogo } from "./Logo";

export interface HeaderTab {
  href: string;
  label: string;
  icon?: ReactNode;
  active?: boolean;
}

export interface HeaderDate {
  label: string;
  onPrev?: () => void;
  onNext?: () => void;
  onToday?: () => void;
  isToday?: boolean;
  live?: boolean;
}

export interface HeaderUser {
  initials: string;
  name: string;
  role?: string;
  isAdmin?: boolean;
  onAdmin?: () => void;
  onLogout?: () => void;
}

export interface HelixHeaderProps {
  clientLabel?: string;
  tabs?: HeaderTab[];
  date?: HeaderDate;
  user?: HeaderUser;
  /** Optional slot rendered between date nav and clocks (e.g. extra filters). */
  extras?: ReactNode;
}

function useClocks() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const palma = now.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Madrid",
  });
  const zulu = now.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
  return { palma, zulu };
}

export function HelixHeader({
  clientLabel = "Mallorcair · LEPA",
  tabs,
  date,
  user,
  extras,
}: HelixHeaderProps) {
  const { palma, zulu } = useClocks();
  return (
    <header className="hx-header">
      <Link href="/dia" className="brand" style={{ textDecoration: "none", color: "inherit" }}>
        <HelixLogo size={26} className="brand-mark" />
        <div className="brand-text">
          <div className="brand-name">Helix</div>
          <div className="brand-tag">{clientLabel}</div>
        </div>
      </Link>

      {tabs && tabs.length > 0 ? (
        <nav className="hx-tabs">
          {tabs.map((t) => (
            <Link key={t.href} href={t.href} className={t.active ? "on" : undefined}>
              {t.icon ? <span className="ico">{t.icon}</span> : null}
              {t.label}
            </Link>
          ))}
        </nav>
      ) : null}

      {date ? (
        <div className="hx-date-nav">
          <button type="button" onClick={date.onPrev} aria-label="Día anterior">‹</button>
          <span className="today-tag">{date.label}</span>
          <button type="button" onClick={date.onNext} aria-label="Día siguiente">›</button>
          {date.isToday === false && date.onToday ? (
            <button
              type="button"
              onClick={date.onToday}
              className="today-tag"
              style={{ marginLeft: 4, background: "rgb(255 255 255 / 0.12)", cursor: "pointer" }}
              title="Volver a hoy (T)"
            >
              Hoy
            </button>
          ) : null}
          {date.live ? <span className="live-dot" title="SSE conectado · sincronía live" /> : null}
        </div>
      ) : null}

      {extras}

      <div className="hx-clocks">
        <div className="hx-clock">
          <span className="l">Palma</span>
          <span className="v">{palma}</span>
        </div>
        <div className="hx-clock zulu">
          <span className="l">Zulu</span>
          <span className="v">{zulu}</span>
        </div>
      </div>

      {user ? <UserPopover user={user} /> : null}
    </header>
  );
}

function UserPopover({ user }: { user: HeaderUser }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref} style={{ marginLeft: "var(--s-3)" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="hx-user-mark"
        style={{ marginLeft: 0, cursor: "pointer" }}
        aria-haspopup="menu"
        aria-expanded={open}
        title={user.name}
      >
        {user.initials}
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-2 min-w-[200px] rounded-hx-md border border-line bg-bg py-1 shadow-hx-lg"
        >
          <div className="border-b border-line-subtle px-4 py-2">
            <div className="text-sm font-semibold text-ink-1">{user.name}</div>
            {user.role ? (
              <div className="font-mono text-[10px] uppercase tracking-wider text-ink-muted">
                {user.role}
              </div>
            ) : null}
          </div>
          {user.isAdmin && user.onAdmin ? (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                user.onAdmin?.();
              }}
              className="block w-full px-4 py-2 text-left text-sm text-ink-2 hover:bg-bg-muted"
            >
              Admin
            </button>
          ) : null}
          {user.onLogout ? (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                user.onLogout?.();
              }}
              className="block w-full px-4 py-2 text-left text-sm text-danger-strong hover:bg-danger-bg"
            >
              Salir
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
