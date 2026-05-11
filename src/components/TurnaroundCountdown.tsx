"use client";

import { useLiveCountdown } from "@/hooks/useLiveCountdown";
import { getFlightClock } from "@/lib/flightUrgency";

interface TurnaroundCountdownProps {
  eta?: string | null;
  etd?: string | null;
  flightState: string;
  /** DaySheet UTC date this flight belongs to. Anchors the countdown to the
   * correct day so flights scheduled for tomorrow don't show as "+17h late". */
  dayUtc?: Date | null;
}

/**
 * Countdown que se ajusta a la fase del vuelo:
 *  - EXPECTED → cuenta hasta ETA
 *  - ON_BLOCKS / PARKED / TURNAROUND / BOARDING → cuenta hasta ETD
 *  - OFF_BLOCKS → oculto
 */
export function TurnaroundCountdown({ eta, etd, flightState, dayUtc }: TurnaroundCountdownProps) {
  const clock = getFlightClock({ state: flightState, eta: eta ?? null, etd: etd ?? null });
  const minutesLeft = useLiveCountdown(clock.ref, dayUtc);

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
    ? "bg-red-100 text-red-700 ring-red-300"
    : isCritical
      ? "bg-orange-100 text-orange-700 ring-orange-300"
      : isWarning
        ? "bg-yellow-100 text-yellow-700 ring-yellow-300"
        : "bg-gray-100 text-gray-600 ring-gray-300";

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
