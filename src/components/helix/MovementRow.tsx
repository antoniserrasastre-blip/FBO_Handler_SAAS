// MovementRow — one leg (ARR or DEP) inside a VisitCard. Renders the
// direction chip, scheduled time in mono big, origin/destination, the
// state pill plus the action-relevant pax/crew/parking summary.

import { StatePill, type FboState } from "./Pill";
import { ServicePip, type ServicePipState } from "./ServicePip";
import { QuickTimeEdit } from "@/components/QuickTimeEdit";

export interface MovementRowProps {
  direction: "ARRIVAL" | "DEPARTURE";
  time: string | null;                // HH:MM Zulu
  airport: string | null;             // origin (ARR) or destination (DEP) ICAO
  state: FboState;
  paxCount: number;
  crewCount: number;
  parking?: string | null;
  cancelled?: boolean;
  /** Optional fuel/toilet pip slot (DEPARTURE only typically). */
  fuelState?: ServicePipState;
  toiletState?: ServicePipState;
  /** When provided, the time becomes editable via QuickTimeEdit. */
  onTimeSave?: (newTime: string) => void;
}

const DIR_LABEL: Record<MovementRowProps["direction"], string> = {
  ARRIVAL: "Llegada",
  DEPARTURE: "Salida",
};

export function MovementRow({
  direction,
  time,
  airport,
  state,
  paxCount,
  crewCount,
  parking,
  cancelled,
  fuelState,
  toiletState,
  onTimeSave,
}: MovementRowProps) {
  return (
    <div className={`hx-movement-row ${cancelled ? "cancelled" : ""}`}>
      <div className={`hx-dir-chip ${direction === "ARRIVAL" ? "hx-dir-arr" : "hx-dir-dep"}`}>
        {direction === "ARRIVAL" ? "ARR" : "DEP"}
      </div>

      <div className="leg-route">
        <div className="airport">{airport || "—"}</div>
        <div className="label">{DIR_LABEL[direction]}</div>
      </div>

      <div className="leg-meta">
        <StatePill state={state} />
        <span className="text-xs text-ink-3 font-mono" title={`${paxCount} pax · ${crewCount} crew`}>
          {paxCount}p · {crewCount}c
        </span>
        {parking ? (
          <span className="hx-pill hx-pill-default" title="Stand">
            {parking}
          </span>
        ) : null}
        {fuelState ? <ServicePip service="fuel" state={fuelState} size="sm" /> : null}
        {toiletState ? <ServicePip service="lavatory" state={toiletState} size="sm" /> : null}
        {onTimeSave ? (
          <span className="leg-time" style={{ minWidth: 70 }}>
            <QuickTimeEdit value={time} onSave={onTimeSave} />
          </span>
        ) : (
          <span className={`leg-time ${time ? "" : "placeholder"}`} style={{ minWidth: 70 }}>
            {time || "--:--"}
          </span>
        )}
      </div>
    </div>
  );
}
