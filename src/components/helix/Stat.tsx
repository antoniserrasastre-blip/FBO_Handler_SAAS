import { ReactNode } from "react";

export interface StatProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "default" | "alert" | "brand";
}

export function Stat({ label, value, sub, tone = "default" }: StatProps) {
  const toneClass = tone === "alert" ? "alert" : tone === "brand" ? "brand" : "";
  return (
    <div className={`hx-stat ${toneClass}`}>
      <div className="l">{label}</div>
      <div className="v">{value}</div>
      {sub ? <div className="s">{sub}</div> : null}
    </div>
  );
}

export function StatBand({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`hx-stat-band ${className}`}>{children}</div>;
}
