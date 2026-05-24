// ServiceChipRow — banda de servicios para /lista, touch-friendly.
//
// Sustituye el strip de pips chiquitos por chips ≥48px de alto con icono
// reconocible, etiqueta del servicio (Catering / Vajillas / Agua…), target
// (CREW/PAX) si aplica, y estado actual (Pendiente / Aquí / Entregado).
//
// Interacción:
//   • Tap corto      → cicla PENDING → ARRIVED → DELIVERED → PENDING.
//   • Pulsación larga (≥600ms) → cancela / restaura.
//     - Cualquier estado activo → CANCELLED.
//     - CANCELLED              → PENDING (restaurar).
//   • Tap corto sobre CANCELLED → no-op (evitamos reactivar por accidente
//     al cancelar varios chips seguidos).

"use client";

import type { Service } from "@/types/compat";
import { SERVICE_LABELS, SERVICE_FROM_WAREHOUSE, type ServiceType, type ShiftPost } from "@/types";
import { nextServiceState, type ServiceCycleState } from "@/lib/serviceCycle";
import { iconForServiceType } from "@/lib/serviceIconMap";
import { ServiceIcons } from "@/components/helix/ServiceIcons";
import { isServiceOverdue } from "@/lib/overdue";
import { useLongPress } from "@/hooks/useLongPress";

export type ServiceChipState = ServiceCycleState | "CANCELLED";

type Tone = "neutral" | "progress" | "done" | "cancelled";

const TONE_CLASS: Record<Tone, string> = {
  neutral:   "bg-bg-muted text-ink-2 border-line",
  progress:  "bg-warning-bg text-warning-strong border-warning-bg",
  done:      "bg-success-bg text-success-strong border-success-bg",
  cancelled: "bg-bg-muted text-ink-disabled border-line-subtle line-through opacity-60",
};

const STATE_LABEL: Record<string, string> = {
  PENDING: "Pendiente",
  ARRIVED: "Aquí",
  DELIVERED: "Entregado",
  CANCELLED: "Cancelado",
};

function toneFor(state: string): Tone {
  if (state === "CANCELLED") return "cancelled";
  if (state === "DELIVERED") return "done";
  if (state === "ARRIVED") return "progress";
  return "neutral";
}

const TARGET_LABEL: Record<string, string> = {
  CREW: "Crew",
  PAX: "Pax",
};

interface ServiceChipProps {
  service: Service;
  onToggle: (newState: ServiceChipState) => void;
  disabled?: boolean;
  highlight?: boolean;
}

function ServiceChip({ service, onToggle, disabled, highlight }: ServiceChipProps) {
  const Icon = ServiceIcons[iconForServiceType(service.type)];
  const baseLabel =
    service.customName ||
    SERVICE_LABELS[service.type as ServiceType] ||
    service.type;
  const targetSuffix = service.target ? ` · ${TARGET_LABEL[service.target] ?? service.target}` : "";
  const overdue = isServiceOverdue(service);
  const isCancelled = service.state === "CANCELLED";
  const tone = toneFor(service.state);
  const stateText = STATE_LABEL[service.state] ?? service.state;

  const { handlers, isPressing } = useLongPress({
    onLongPress: () => {
      if (disabled) return;
      onToggle(isCancelled ? "PENDING" : "CANCELLED");
    },
    onClick: () => {
      if (disabled) return;
      // Tap corto sobre un chip cancelado es no-op: sólo long-press restaura.
      if (isCancelled) return;
      onToggle(nextServiceState(service.state));
    },
  });

  // Feedback táctil: el press-state usa una transición de 200ms (dentro del
  // rango 150–300ms) y sólo escala/anillo, sin alterar el box model para que
  // no haya saltos de layout entre chips.
  const pressClass = isPressing && !disabled ? "scale-95 ring-2 ring-danger-strong/50" : "";
  const overdueClass = overdue && !isCancelled ? "overdue ring-2 ring-danger-strong" : "";
  const highlightClass =
    highlight && !isCancelled && !(overdue && !isCancelled) && !(isPressing && !disabled)
      ? "ring-2 ring-info-strong ring-offset-1"
      : "";
  const ariaHint = isCancelled
    ? "Mantén pulsado para restaurar"
    : "Mantén pulsado para cancelar";

  return (
    <button
      type="button"
      disabled={disabled}
      // Bloqueamos la propagación al contenedor de la lista; el ciclo real
      // lo dispara el hook (pointerup → onClick) o el long-press.
      onClick={(e) => e.stopPropagation()}
      {...handlers}
      className={`flex min-h-[56px] min-w-[104px] flex-col items-start justify-center gap-1 rounded-hx-md border px-3.5 py-2 text-left transition duration-200 ease-snap will-change-transform disabled:cursor-default disabled:opacity-50 ${TONE_CLASS[tone]} ${overdueClass} ${highlightClass} ${pressClass}`}
      aria-label={`${baseLabel}${targetSuffix}: ${stateText}${overdue && !isCancelled ? " (retrasado)" : ""}. ${ariaHint}.`}
      title={service.reference ? `#${service.reference}` : undefined}
      style={{ touchAction: "manipulation" }}
    >
      <span className="flex items-center gap-2 text-sm font-semibold leading-tight">
        <Icon width={18} height={18} className="shrink-0" />
        <span className="truncate max-w-[150px]">{baseLabel}{targetSuffix}</span>
      </span>
      <span className="flex items-center gap-1.5 text-sm font-mono font-semibold leading-tight">
        {stateText}
        {overdue && !isCancelled ? (
          <span className="text-danger-strong" aria-hidden>
            ⚠ Retrasado
          </span>
        ) : null}
      </span>
    </button>
  );
}

export interface ServiceChipRowProps {
  services: Service[];
  onToggle?: (serviceId: string, newState: ServiceChipState) => void;
  readOnly?: boolean;
  posts?: ShiftPost[];
}

export function ServiceChipRow({ services, onToggle, readOnly = false, posts }: ServiceChipRowProps) {
  if (services.length === 0) return null;
  const delivered = services.filter((s) => s.state === "DELIVERED").length;
  const active = services.filter((s) => s.state !== "CANCELLED").length;
  const disabled = readOnly || !onToggle;

  const runnerTurn = !!posts?.includes("RUNNER");
  const filterTurn = !!posts?.some((p) => p === "ARRIVALS" || p === "DEPARTURES");

  return (
    <div
      className="services-strip flex flex-wrap items-center gap-2 border-t border-line-subtle bg-bg px-2 py-2"
      onClick={(e) => e.stopPropagation()}
    >
      {services.map((s) => {
        const fromWarehouse = SERVICE_FROM_WAREHOUSE[s.type as ServiceType] ?? false;
        const mine =
          fromWarehouse &&
          ((runnerTurn && s.state === "PENDING") || (filterTurn && s.state === "ARRIVED"));
        return (
          <ServiceChip
            key={s.id}
            service={s}
            disabled={disabled}
            highlight={mine}
            onToggle={(next) => onToggle?.(s.id, next)}
          />
        );
      })}
      <span className="ml-auto flex flex-col items-end gap-0.5 text-right">
        <span className="text-sm font-mono font-semibold text-ink-1">
          {delivered}/{active} servidos
        </span>
        {!disabled ? (
          <span className="text-xs font-medium text-ink-2">
            Mantén pulsado para cancelar
          </span>
        ) : null}
      </span>
    </div>
  );
}
