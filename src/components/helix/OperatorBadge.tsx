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
  const known = !!op;
  const name = op?.name;
  const title = known
    ? `Filtrar por ${name}`
    : `Operador desconocido (${icao}) — privado o sin catalogar`;
  const content = (
    <span className={`hx-pill hx-pill-operator${known ? "" : " hx-pill-operator--unknown"}`}>
      {known ? (
        <>
          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{icao}</span>
          <span style={{ color: "var(--c-text-2)" }}>{name}</span>
        </>
      ) : (
        <>
          <span>Privado</span>
          <span style={{ fontFamily: "var(--font-mono)", opacity: 0.8 }}>· {icao}</span>
        </>
      )}
    </span>
  );
  if (!onSelect) return content;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onSelect(icao); }}
      title={title}
      style={{ background: "transparent", border: 0, padding: 0, cursor: "pointer" }}
    >
      {content}
    </button>
  );
}
