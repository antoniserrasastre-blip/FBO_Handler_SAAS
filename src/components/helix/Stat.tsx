import { ReactNode } from "react";

export interface StatProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "default" | "alert" | "brand";
  /** Si se provee, el Stat se renderiza como botón clicable. */
  onClick?: () => void;
}

export function Stat({ label, value, sub, tone = "default", onClick }: StatProps) {
  const toneClass = tone === "alert" ? "alert" : tone === "brand" ? "brand" : "";
  const inner = (
    <>
      <div className="l">{label}</div>
      <div className="v">{value}</div>
      {sub ? <div className="s">{sub}</div> : null}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={`hx-stat ${toneClass} cursor-pointer text-left transition-colors hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-danger-strong/40`}
      >
        {inner}
      </button>
    );
  }
  return (
    <div className={`hx-stat ${toneClass}`}>
      {inner}
    </div>
  );
}

export function StatBand({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`hx-stat-band ${className}`}>{children}</div>;
}
