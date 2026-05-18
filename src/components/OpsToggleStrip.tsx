// OpsToggleStrip — banda de toggles operativos para /lista (móvil/tablet/touch).
//
// El operario de ramp/filtro marca aquí lo que cambia varias veces durante
// el turno: fuel, toilet, ubicación de pilotos, estado del transporte
// organizado. Todo en chips grandes (≥48px alto) con un click/tap para
// avanzar de estado. La idea es no obligarle a expandir cards ni navegar al
// detail panel para acciones cotidianas.
//
// Cuando state === BOARDING aparece un CTA verde "Despegó" para cerrar el
// vuelo (OFF_BLOCKS) en un tap.

"use client";

import type { ReactNode } from "react";
import { Fuel, Droplet, Users, Car, PlaneTakeoff } from "lucide-react";
import type { Flight } from "@/types/compat";
import {
  FUEL_LABELS,
  TOILET_LABELS,
  CREW_ARR_LOCATION_LABELS,
  CREW_DEP_LOCATION_LABELS,
  TRANSPORT_LABELS,
  normalizeFlightState,
} from "@/types";

type Tone = "neutral" | "progress" | "done" | "go";

const TONE_CLASS: Record<Tone, string> = {
  neutral:  "bg-bg-muted text-ink-2 border-line",
  progress: "bg-warning-bg text-warning-strong border-warning-bg",
  done:     "bg-success-bg text-success-strong border-success-bg",
  go:       "bg-success-strong text-white border-success-strong",
};

const FUEL_CYCLE: Record<string, string> = {
  NOT_REQUESTED: "REQUESTED",
  REQUESTED: "SERVED",
  SERVED: "NOT_REQUESTED",
};

const TOILET_CYCLE: Record<string, string> = {
  NOT_REQUESTED: "REQUESTED",
  REQUESTED: "COMPLETED",
  COMPLETED: "NOT_REQUESTED",
};

const CREW_ARR_CYCLE: Record<string, string> = {
  IN_AIRCRAFT: "IN_LOUNGE",
  IN_LOUNGE: "HOTEL",
  HOTEL: "IN_AIRCRAFT",
};

const CREW_DEP_CYCLE: Record<string, string> = {
  NOT_ARRIVED: "IN_LOUNGE",
  IN_LOUNGE: "IN_AIRCRAFT",
  IN_AIRCRAFT: "NOT_ARRIVED",
};

const TRANSPORT_CYCLE: Record<string, string> = {
  PENDING: "CONFIRMED",
  CONFIRMED: "PENDING",
};

function fuelTone(s: string | null | undefined): Tone {
  if (s === "SERVED") return "done";
  if (s === "REQUESTED") return "progress";
  return "neutral";
}
function toiletTone(s: string | null | undefined): Tone {
  if (s === "COMPLETED") return "done";
  if (s === "REQUESTED") return "progress";
  return "neutral";
}
function crewArrTone(s: string | null | undefined): Tone {
  if (s === "HOTEL") return "done";
  if (s === "IN_LOUNGE") return "progress";
  return "neutral";
}
function crewDepTone(s: string | null | undefined): Tone {
  if (s === "IN_AIRCRAFT") return "done";
  if (s === "IN_LOUNGE") return "progress";
  return "neutral";
}
function transportTone(s: string | null | undefined): Tone {
  if (s === "CONFIRMED") return "done";
  return "progress";
}

interface ToggleChipProps {
  icon: ReactNode;
  label: string;
  value: string;
  tone: Tone;
  onClick: () => void;
  disabled?: boolean;
}

function ToggleChip({ icon, label, value, tone, onClick, disabled }: ToggleChipProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onClick();
      }}
      className={`flex min-h-[48px] min-w-[68px] flex-col items-center justify-center gap-0.5 rounded-hx-md border px-2 py-1 text-center transition active:scale-95 disabled:cursor-default disabled:opacity-50 ${TONE_CLASS[tone]}`}
      aria-label={`${label}: ${value}`}
    >
      <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider leading-none">
        {icon} {label}
      </span>
      <span className="text-[11px] font-mono leading-tight">{value}</span>
    </button>
  );
}

export interface OpsToggleStripProps {
  flight: Flight;
  onUpdate: (id: string, data: Partial<Flight>) => void;
  readOnly?: boolean;
}

export function OpsToggleStrip({ flight, onUpdate, readOnly = false }: OpsToggleStripProps) {
  const disabled = readOnly;

  const cycleFuel = () => {
    const next = FUEL_CYCLE[flight.fuelState] || "NOT_REQUESTED";
    const data: Partial<Flight> & Record<string, unknown> = { fuelState: next };
    if (next === "REQUESTED") data.fuelRequestedAt = new Date().toISOString();
    if (next === "SERVED") data.fuelServedAt = new Date().toISOString();
    onUpdate(flight.id, data);
  };

  const cycleToilet = () => {
    const next = TOILET_CYCLE[flight.toiletState] || "NOT_REQUESTED";
    const data: Partial<Flight> & Record<string, unknown> = { toiletState: next };
    if (next === "REQUESTED") data.toiletRequestedAt = new Date().toISOString();
    if (next === "COMPLETED") data.toiletCompletedAt = new Date().toISOString();
    onUpdate(flight.id, data);
  };

  const cycleCrewArr = () => {
    const next = CREW_ARR_CYCLE[flight.crewArrLocation] || "IN_AIRCRAFT";
    onUpdate(flight.id, { crewArrLocation: next } as Partial<Flight>);
  };

  const cycleCrewDep = () => {
    const next = CREW_DEP_CYCLE[flight.crewDepLocation] || "NOT_ARRIVED";
    onUpdate(flight.id, { crewDepLocation: next } as Partial<Flight>);
  };

  const cycleTransportArr = () => {
    const next = TRANSPORT_CYCLE[flight.paxArrTransportState] || "CONFIRMED";
    onUpdate(flight.id, { paxArrTransportState: next } as Partial<Flight>);
  };

  const cycleTransportDep = () => {
    const next = TRANSPORT_CYCLE[flight.paxDepTransportState] || "CONFIRMED";
    onUpdate(flight.id, { paxDepTransportState: next } as Partial<Flight>);
  };

  const closeFlight = () => {
    onUpdate(flight.id, { state: "OFF_BLOCKS" } as Partial<Flight>);
  };

  const normalized = normalizeFlightState(flight.state);
  const showCloseCTA = normalized === "BOARDING";

  const showTransportArr = flight.paxArrTransportType && flight.paxArrTransportType !== "UNDEFINED";
  const showTransportDep = flight.paxDepTransportType && flight.paxDepTransportType !== "UNDEFINED";

  // Crew chips: ARR solo cuando aún no ha despegado; DEP siempre (es el ciclo
  // hacia el board). Para vuelos de un solo leg (ferry, etc.) seguirá siendo
  // visible — el operario lo ignora si no aplica.
  const showCrewArr = normalized !== "OFF_BLOCKS";
  const showCrewDep = normalized !== "OFF_BLOCKS";

  return (
    <div
      className="flex flex-wrap gap-1.5 border-t border-line-subtle bg-bg-subtle px-2 py-2"
      onClick={(e) => e.stopPropagation()}
    >
      <ToggleChip
        icon={<Fuel size={12} />}
        label="Fuel"
        value={FUEL_LABELS[flight.fuelState as keyof typeof FUEL_LABELS] ?? flight.fuelState}
        tone={fuelTone(flight.fuelState)}
        onClick={cycleFuel}
        disabled={disabled}
      />
      <ToggleChip
        icon={<Droplet size={12} />}
        label="WC"
        value={TOILET_LABELS[flight.toiletState as keyof typeof TOILET_LABELS] ?? flight.toiletState}
        tone={toiletTone(flight.toiletState)}
        onClick={cycleToilet}
        disabled={disabled}
      />
      {showCrewArr && (
        <ToggleChip
          icon={<Users size={12} />}
          label="Crew LL"
          value={CREW_ARR_LOCATION_LABELS[flight.crewArrLocation] ?? flight.crewArrLocation}
          tone={crewArrTone(flight.crewArrLocation)}
          onClick={cycleCrewArr}
          disabled={disabled}
        />
      )}
      {showCrewDep && (
        <ToggleChip
          icon={<Users size={12} />}
          label="Crew SAL"
          value={CREW_DEP_LOCATION_LABELS[flight.crewDepLocation] ?? flight.crewDepLocation}
          tone={crewDepTone(flight.crewDepLocation)}
          onClick={cycleCrewDep}
          disabled={disabled}
        />
      )}
      {showTransportArr && (
        <ToggleChip
          icon={<Car size={12} />}
          label="Transp LL"
          value={`${TRANSPORT_LABELS[flight.paxArrTransportType as keyof typeof TRANSPORT_LABELS] ?? ""} · ${flight.paxArrTransportState === "CONFIRMED" ? "OK" : "Pdte"}`}
          tone={transportTone(flight.paxArrTransportState)}
          onClick={cycleTransportArr}
          disabled={disabled}
        />
      )}
      {showTransportDep && (
        <ToggleChip
          icon={<Car size={12} />}
          label="Transp SAL"
          value={`${TRANSPORT_LABELS[flight.paxDepTransportType as keyof typeof TRANSPORT_LABELS] ?? ""} · ${flight.paxDepTransportState === "CONFIRMED" ? "OK" : "Pdte"}`}
          tone={transportTone(flight.paxDepTransportState)}
          onClick={cycleTransportDep}
          disabled={disabled}
        />
      )}
      {showCloseCTA && (
        <button
          type="button"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            if (!disabled) closeFlight();
          }}
          className={`ml-auto flex min-h-[48px] items-center gap-1.5 rounded-hx-md border px-3 py-1 text-sm font-semibold transition active:scale-95 disabled:cursor-default disabled:opacity-50 ${TONE_CLASS.go}`}
          aria-label="Marcar despegue (OFF_BLOCKS)"
        >
          <PlaneTakeoff size={16} /> Despegó
        </button>
      )}
    </div>
  );
}
