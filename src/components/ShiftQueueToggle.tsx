"use client";

// Control segmentado "Mi cola" vs "Toda la jornada".
//
// Sustituye al antiguo texto gris + botón pill (page.tsx) por dos segmentos
// táctiles (≥44px de alto) que muestran de un vistazo en qué modo estás y
// cuántos vuelos hay en tu cola de turno. El estado lo controla page.tsx
// (`shiftQueueActive`); aquí solo pintamos y notificamos el cambio.

import { ListChecks, CalendarDays } from "lucide-react";

export interface ShiftQueueToggleProps {
  /** true → "Mi cola"; false → "Toda la jornada". Controlado por page.tsx. */
  active: boolean;
  onChange: (active: boolean) => void;
  /** Etiquetas de los puestos fichados (p.ej. "Rampa, Llegadas"). */
  postsLabel: string;
  /** Nº de vuelos visibles en la cola actual. */
  queueCount: number;
}

export function ShiftQueueToggle({ active, onChange, postsLabel, queueCount }: ShiftQueueToggleProps) {
  return (
    <div
      role="group"
      aria-label="Modo de vista de turno"
      className="grid grid-cols-2 gap-1 rounded-hx-md bg-bg-muted p-1"
    >
      <button
        type="button"
        aria-pressed={active}
        onClick={() => onChange(true)}
        className={`flex min-h-[44px] flex-col items-center justify-center rounded-hx-sm px-2 py-1.5 text-center transition-colors focus:outline-none focus:ring-2 focus:ring-brand/40 ${
          active
            ? "bg-bg text-ink-1 shadow-hx-sm"
            : "text-ink-3 hover:text-ink-1"
        }`}
      >
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          <ListChecks size={15} className={active ? "text-brand" : ""} />
          Mi cola
          <span
            className={`ml-0.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-hx-pill px-1.5 text-xs font-bold tabular-nums ${
              active ? "bg-brand-tint text-brand-active" : "bg-bg-sunken text-ink-3"
            }`}
          >
            {queueCount}
          </span>
        </span>
        <span className="mt-0.5 max-w-full truncate text-xs font-normal text-ink-3">
          {postsLabel}
        </span>
      </button>

      <button
        type="button"
        aria-pressed={!active}
        onClick={() => onChange(false)}
        className={`flex min-h-[44px] flex-col items-center justify-center rounded-hx-sm px-2 py-1.5 text-center transition-colors focus:outline-none focus:ring-2 focus:ring-brand/40 ${
          !active
            ? "bg-bg text-ink-1 shadow-hx-sm"
            : "text-ink-3 hover:text-ink-1"
        }`}
      >
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          <CalendarDays size={15} className={!active ? "text-brand" : ""} />
          Toda la jornada
        </span>
        <span className="mt-0.5 text-xs font-normal text-ink-3">Todos los puestos</span>
      </button>
    </div>
  );
}
