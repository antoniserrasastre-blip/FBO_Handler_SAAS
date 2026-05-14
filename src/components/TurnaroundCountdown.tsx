"use client";

import { useLiveCountdown } from "@/hooks/useLiveCountdown";
import { getFlightClock } from "@/lib/flightUrgency";

interface TurnaroundCountdownProps {
  eta?: string | null;
  etd?: string | null;
  flightState: string;
}

/**
 * Countdown que se ajusta a la fase del vuelo:
 *  - EXPECTED → cuenta hasta ETA
 *  - ON_BLOCKS / PARKED / TURNAROUND / BOARDING → cuenta hasta ETD
 *  - OFF_BLOCKS → oculto
 */
export function TurnaroundCountdown({ eta, etd, flightState }: TurnaroundCountdownProps) {
  const clock = getFlightClock({ state: flightState, eta: eta ?? null, etd: etd ?? null });
  const minutesLeft = useLiveCountdown(clock.ref);

  if (minutesLeft === null || clock.kind === null) return null;
  if (minutesLeft > 180) return null;

  const isPast = minutesLeft < 0;
  const isCritical = !isPast && minutesLeft <= 30;
  const isWarning = !isPast && minutesLeft <= 60;

  const abs = Math.abs(minutesLeft);
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  const display = hours > 0 ? `${hours}h${String(mins).padStart(2, "0")}` : `${mins}m`;

  const color = isPast
    ? "bg-danger-bg text-danger-strong ring-danger"
    : isCritical
      ? "bg-warning-bg text-warning-strong ring-warning"
      : isWarning
        ? "bg-warning-bg text-warning-strong ring-warning"
        : "bg-bg-muted text-ink-2 ring-line";

  const verbPast = clock.kind === "ETA" ? "Llegada retrasada" : "Salida retrasada";
  const verbFuture = clock.kind === "ETA" ? "Tiempo hasta ETA" : "Tiempo hasta ETD";
  const prefix = clock.kind === "ETA" ? "↓" : "↑";

  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${color}`}
      title={isPast ? verbPast : verbFuture}
    >
      <span className="opacity-70">{prefix}</span>
      {isPast ? `+${display}` : display}
    </span>
  );
}
