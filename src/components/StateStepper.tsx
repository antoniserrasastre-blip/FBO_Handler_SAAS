// StateStepper — segmented control horizontal con progresión cronológica.
//
// 6 chips, uno por FlightState, en orden temporal:
//   Esperado → Calzos → Plataforma → Preparación → Boarding → Despegó
//
// Comunica el ciclo de vida del vuelo: el chip "current" se rellena con el
// color del estado, los pasados están atenuados con check, los futuros van
// en outline. Tap directo en cualquiera dispara onChange — radio (uno solo
// seleccionado a la vez).
//
// Filosofía: ejecutable sin abrir más info. Es la consola principal del
// estado del vuelo para rampa.

"use client";

import { Check } from "lucide-react";
import { FLIGHT_STATES, FLIGHT_STATE_CONFIG, normalizeFlightState, type FlightState } from "@/types";

const SHORT_LABEL: Record<FlightState, string> = {
  EXPECTED:   "Esperado",
  ON_BLOCKS:  "Calzos",
  PARKED:     "Plataforma",
  TURNAROUND: "Preparación",
  BOARDING:   "Boarding",
  OFF_BLOCKS: "Despegó",
};

export interface StateStepperProps {
  value: string;
  onChange: (next: FlightState) => void;
  disabled?: boolean;
}

export function StateStepper({ value, onChange, disabled = false }: StateStepperProps) {
  const current = normalizeFlightState(value);
  const currentIdx = FLIGHT_STATES.indexOf(current);

  return (
    <div
      role="radiogroup"
      aria-label="Estado del vuelo"
      className="state-stepper flex items-center gap-1 overflow-x-auto border-t border-line-subtle bg-bg-sunken px-2 py-2 [scroll-snap-type:x_proximity] [-webkit-overflow-scrolling:touch]"
      onClick={(e) => e.stopPropagation()}
    >
      {FLIGHT_STATES.map((s, idx) => {
        const cfg = FLIGHT_STATE_CONFIG[s];
        const isCurrent = idx === currentIdx;
        const position = isCurrent ? "current" : idx < currentIdx ? "past" : "future";
        const showConnector = idx > 0;

        return (
          <div key={s} className="flex items-center shrink-0 [scroll-snap-align:start]">
            {showConnector ? (
              <span
                aria-hidden="true"
                className={`h-px w-3 ${idx <= currentIdx ? "bg-ink-2" : "bg-line"}`}
              />
            ) : null}
            <button
              type="button"
              role="radio"
              aria-checked={isCurrent}
              data-position={position}
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                if (!disabled && !isCurrent) onChange(s);
              }}
              style={isCurrent ? { backgroundColor: cfg.color, borderColor: cfg.color, color: "#fff" } : undefined}
              className={`flex min-h-[36px] items-center gap-1 rounded-full border px-2.5 text-[12px] font-semibold whitespace-nowrap transition active:scale-95 disabled:cursor-default disabled:opacity-50 ${
                isCurrent
                  ? "shadow-hx-sm"
                  : position === "past"
                    ? "border-line bg-bg-subtle text-ink-3"
                    : "border-line-subtle bg-bg text-ink-muted hover:bg-bg-subtle hover:text-ink-2"
              }`}
            >
              {position === "past" ? <Check size={11} className="opacity-70" /> : null}
              {SHORT_LABEL[s]}
            </button>
          </div>
        );
      })}
    </div>
  );
}
