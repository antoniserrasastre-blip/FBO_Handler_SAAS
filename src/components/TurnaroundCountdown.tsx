"use client";

import { useLiveCountdown } from "@/hooks/useLiveCountdown";

interface TurnaroundCountdownProps {
  etd: string | null | undefined;
  flightState: string;
}

export function TurnaroundCountdown({ etd, flightState }: TurnaroundCountdownProps) {
  const minutesLeft = useLiveCountdown(etd);

  // Hide if no ETD, or flight already dispatched, or too far in the future (>3h)
  if (minutesLeft === null || flightState === "DISPATCHED") return null;
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

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${color}`} title={isPast ? "Retrasado" : "Tiempo hasta ETD"}>
      {isPast ? `+${display}` : display}
    </span>
  );
}
