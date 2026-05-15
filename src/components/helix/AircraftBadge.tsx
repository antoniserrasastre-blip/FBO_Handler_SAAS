// AircraftBadge — registration in mono, optional aircraft type.
// Click handler is wired so the parent can route to /aircraft/[reg]
// when the aircraft history page exists (Capa B follow-up).

import { HTMLAttributes } from "react";

export interface AircraftBadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, "title"> {
  registration: string;
  aircraftType?: string | null;
  onSelectRegistration?: (registration: string) => void;
}

export function AircraftBadge({
  registration,
  aircraftType,
  onSelectRegistration,
  className = "",
  ...rest
}: AircraftBadgeProps) {
  const reg = registration || "—";
  const content = (
    <span className={`hx-pill hx-pill-aircraft ${className}`} {...rest}>
      <span>{reg}</span>
      {aircraftType ? (
        <span className="text-ink-muted" style={{ fontWeight: 400 }}>
          · {aircraftType}
        </span>
      ) : null}
    </span>
  );
  if (!onSelectRegistration) return content;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onSelectRegistration(reg); }}
      title={`Filtrar por ${reg}`}
      style={{ background: "transparent", border: 0, padding: 0, cursor: "pointer" }}
    >
      {content}
    </button>
  );
}
