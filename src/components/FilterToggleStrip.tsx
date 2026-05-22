"use client";

// Three combinable filter chips that sit above the dashboard SearchBar.
//
// - "Solo pendientes"   — `isFlightPending(flight)` is true
// - "Próximas Xh"       — arrival or departure within ±X h of now (only shown
//                         when the operations date is today; pointless on
//                         past/future days where wall-clock has no meaning).
//                         Cycling chip: OFF → 4h → 8h → OFF.
// - "Ocultar cancelados"— flights whose `flightCategory === "CANCELLED"` are
//                         dropped from the list. Time-independent.
//
// Style mirrors the QUICK_FILTERS chips in SearchBar so the strip reads as
// part of the same filter family. State is owned by the parent (page.tsx)
// so it can persist to localStorage and feed `visibleFlights`.

export type NextHoursWindow = 0 | 4 | 8;

export interface FilterToggleStripProps {
  pendingOnly: boolean;
  nextHours: NextHoursWindow;
  hideCancelled: boolean;
  /** When false, the "Próximas Xh" chip is hidden (e.g. !isToday). */
  showNextHours: boolean;
  /** Count over the full flights list (pre-search) for the pending chip. */
  pendingCount?: number;
  /** Count of flights matching the CURRENT window (or 8h when OFF, see page.tsx). */
  nextHoursCount?: number;
  /** Count over the full flights list (pre-search) for the cancelled chip. */
  hideCancelledCount?: number;
  onChange: (next: {
    pendingOnly: boolean;
    nextHours: NextHoursWindow;
    hideCancelled: boolean;
  }) => void;
}

const CHIP_CLASSES =
  "rounded-hx-pill px-2.5 py-0.5 font-mono text-[11px] font-semibold transition-colors";
const ACTIVE_CLASSES = "bg-brand-tint text-brand-active ring-1 ring-brand";
const INACTIVE_CLASSES = "bg-bg-muted text-ink-3 hover:bg-bg-sunken hover:text-ink-1";

// Cycle order for the time-window chip. One click advances by one slot,
// wrapping from 8 back to 0 so the chip can be turned off without leaving
// the keyboard / pointer.
const NEXT_HOURS_CYCLE: Record<NextHoursWindow, NextHoursWindow> = {
  0: 4,
  4: 8,
  8: 0,
};

function nextHoursLabel(value: NextHoursWindow): string {
  // When OFF, surface the default "8h" so the chip reads naturally before any
  // click — the user sees what the filter is _called_, not what it currently
  // does. Active states show the live window.
  if (value === 0) return "Próximas 8h";
  return `Próximas ${value}h`;
}

function nextHoursAriaLabel(value: NextHoursWindow): string {
  switch (value) {
    case 0:
      return "Filtrar a próximas horas (clic para 4h, otro para 8h)";
    case 4:
      return "Filtrar a próximas 4 horas (clic para 8h, otro clic para apagar)";
    case 8:
      return "Filtrar a próximas 8 horas (clic para apagar)";
  }
}

export function FilterToggleStrip({
  pendingOnly,
  nextHours,
  hideCancelled,
  showNextHours,
  pendingCount,
  nextHoursCount,
  hideCancelledCount,
  onChange,
}: FilterToggleStripProps) {
  const nextHoursActive = nextHours > 0;
  return (
    <div className="mb-2 flex flex-wrap items-center gap-1">
      <button
        type="button"
        aria-pressed={pendingOnly}
        onClick={() =>
          onChange({ pendingOnly: !pendingOnly, nextHours, hideCancelled })
        }
        className={`${CHIP_CLASSES} ${pendingOnly ? ACTIVE_CLASSES : INACTIVE_CLASSES}`}
      >
        Solo pendientes
        {pendingCount !== undefined && pendingCount > 0 ? (
          <span className="ml-1 opacity-70">· {pendingCount}</span>
        ) : null}
      </button>

      {showNextHours ? (
        <button
          type="button"
          aria-pressed={nextHoursActive}
          aria-label={nextHoursAriaLabel(nextHours)}
          onClick={() =>
            onChange({
              pendingOnly,
              nextHours: NEXT_HOURS_CYCLE[nextHours],
              hideCancelled,
            })
          }
          className={`${CHIP_CLASSES} ${nextHoursActive ? ACTIVE_CLASSES : INACTIVE_CLASSES}`}
        >
          {nextHoursLabel(nextHours)}
          {nextHoursCount !== undefined && nextHoursCount > 0 ? (
            <span className="ml-1 opacity-70">· {nextHoursCount}</span>
          ) : null}
        </button>
      ) : null}

      <button
        type="button"
        aria-pressed={hideCancelled}
        onClick={() =>
          onChange({ pendingOnly, nextHours, hideCancelled: !hideCancelled })
        }
        className={`${CHIP_CLASSES} ${hideCancelled ? ACTIVE_CLASSES : INACTIVE_CLASSES}`}
      >
        Ocultar cancelados
        {hideCancelledCount !== undefined && hideCancelledCount > 0 ? (
          <span className="ml-1 opacity-70">· {hideCancelledCount}</span>
        ) : null}
      </button>
    </div>
  );
}
