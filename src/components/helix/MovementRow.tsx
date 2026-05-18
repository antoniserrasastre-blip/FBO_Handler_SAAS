// MovementRow — one leg (ARR or DEP) inside a VisitCard. Renders the
// direction chip, scheduled time in mono big, origin/destination, the
// state pill plus the action-relevant pax/crew/parking summary.

import { StatePill, type FboState } from "./Pill";
import { ServicePip, type ServicePipState } from "./ServicePip";
import { QuickTimeEdit } from "@/components/QuickTimeEdit";
import { checkCompatibility, isFarFromGA, getStandDescription } from "@/lib/parkingStands";

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
  /** Scheduled date for this leg (DD/MM/YY). Only rendered if it differs from sheetDate. */
  date?: string | null;
  /** Operating day of the sheet this row belongs to (DD/MM/YY). */
  sheetDate?: string | null;
  /** Aircraft type — enables parking compatibility check (warning/error class). */
  aircraftType?: string | null;
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
  date,
  sheetDate,
  aircraftType,
}: MovementRowProps) {
  const showDate = date && date !== sheetDate;

  const parkingMeta = (() => {
    if (!parking) return null;
    const compat = checkCompatibility(aircraftType, parking);
    const farFromGA = isFarFromGA(parking);
    const description = getStandDescription(parking);
    let cls = "hx-pill hx-pill-default";
    let title = `Stand: ${description}`;
    if (compat.severity === "error") {
      cls = "hx-pill hx-pill-default parking-error";
      title = compat.message || title;
    } else if (farFromGA) {
      cls = "hx-pill hx-pill-default parking-warning";
      title = `${description} — lejos del GA apron`;
    }
    return { cls, title };
  })();
  return (
    <div
      className={`hx-movement-row ${cancelled ? "cancelled" : ""} ${showDate ? "other-day" : ""}`}
      title={showDate ? `Día distinto del operativo (${date})` : undefined}
    >
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
        {parking && parkingMeta ? (
          <span className={parkingMeta.cls} title={parkingMeta.title}>
            {parking}
          </span>
        ) : null}
        {fuelState ? <ServicePip service="fuel" state={fuelState} size="sm" /> : null}
        {toiletState ? <ServicePip service="lavatory" state={toiletState} size="sm" /> : null}
        {showDate ? (
          <span className="leg-date" title="Fecha distinta del dia operativo">
            {date}
          </span>
        ) : null}
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
