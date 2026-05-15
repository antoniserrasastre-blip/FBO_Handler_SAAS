// OperatorBadge — ICAO code + full name. Falls back to "Privado" when the
// callsign doesn't resolve to a known operator.

import { findOperator } from "@/lib/operators";

export interface OperatorBadgeProps {
  callsign?: string | null;
  icaoCode?: string | null;
  onSelect?: (icao: string) => void;
}

export function OperatorBadge({ callsign, icaoCode, onSelect }: OperatorBadgeProps) {
  const op = callsign ? findOperator(callsign) : null;
  const icao = icaoCode || op?.icao || (callsign?.replace(/[*\s]/g, "").match(/^([A-Z]+)/)?.[1] ?? "");
  // No callsign and no ICAO → nothing useful to show. Don't pollute the
  // hero with an empty "Privado" badge.
  if (!icao) return null;
  const name = op?.name || icao;
  const content = (
    <span className="hx-pill hx-pill-operator">
      {icao ? <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{icao}</span> : null}
      <span style={{ color: "var(--c-text-2)" }}>{name}</span>
    </span>
  );
  if (!onSelect || !icao) return content;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onSelect(icao); }}
      title={`Filtrar por ${name}`}
      style={{ background: "transparent", border: 0, padding: 0, cursor: "pointer" }}
    >
      {content}
    </button>
  );
}
