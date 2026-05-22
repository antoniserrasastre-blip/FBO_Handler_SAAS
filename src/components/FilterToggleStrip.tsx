"use client";

// Two combinable filter chips that sit above the dashboard SearchBar.
//
// - "Solo pendientes" — `isFlightPending(flight)` is true
// - "Próximas 8h"     — arrival or departure within ±8h of now (only shown
//                       when the operations date is today; pointless on
//                       past/future days where wall-clock has no meaning)
//
// Style mirrors the QUICK_FILTERS chips in SearchBar so the strip reads as
// part of the same filter family. State is owned by the parent (page.tsx)
// so it can persist to localStorage and feed `visibleFlights`.

export interface FilterToggleStripProps {
  pendingOnly: boolean;
  next8h: boolean;
  /** When false, the "Próximas 8h" chip is hidden (e.g. !isToday). */
  showNext8h: boolean;
  /** Count over the full flights list (pre-search) for the pending chip. */
  pendingCount?: number;
  /** Count over the full flights list (pre-search) for the next-8h chip. */
  next8hCount?: number;
  onChange: (next: { pendingOnly: boolean; next8h: boolean }) => void;
}

const CHIP_CLASSES =
  "rounded-hx-pill px-2.5 py-0.5 font-mono text-[11px] font-semibold transition-colors";
const ACTIVE_CLASSES = "bg-brand-tint text-brand-active ring-1 ring-brand";
const INACTIVE_CLASSES = "bg-bg-muted text-ink-3 hover:bg-bg-sunken hover:text-ink-1";

export function FilterToggleStrip({
  pendingOnly,
  next8h,
  showNext8h,
  pendingCount,
  next8hCount,
  onChange,
}: FilterToggleStripProps) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-1">
      <button
        type="button"
        aria-pressed={pendingOnly}
        onClick={() => onChange({ pendingOnly: !pendingOnly, next8h })}
        className={`${CHIP_CLASSES} ${pendingOnly ? ACTIVE_CLASSES : INACTIVE_CLASSES}`}
      >
        Solo pendientes
        {pendingCount !== undefined && pendingCount > 0 ? (
          <span className="ml-1 opacity-70">· {pendingCount}</span>
        ) : null}
      </button>

      {showNext8h ? (
        <button
          type="button"
          aria-pressed={next8h}
          onClick={() => onChange({ pendingOnly, next8h: !next8h })}
          className={`${CHIP_CLASSES} ${next8h ? ACTIVE_CLASSES : INACTIVE_CLASSES}`}
        >
          Próximas 8h
          {next8hCount !== undefined && next8hCount > 0 ? (
            <span className="ml-1 opacity-70">· {next8hCount}</span>
          ) : null}
        </button>
      ) : null}
    </div>
  );
}
