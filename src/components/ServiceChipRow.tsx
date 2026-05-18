// ServiceChipRow — banda de servicios para /lista, touch-friendly.
//
// Sustituye el strip de pips chiquitos por chips ≥48px de alto con icono
// reconocible, etiqueta del servicio (Catering / Vajillas / Agua…), target
// (CREW/PAX) si aplica, y estado actual (Pendiente / Aquí / Entregado).
// Un tap cicla PENDING → ARRIVED → DELIVERED → PENDING.

"use client";

import type { Service } from "@/types/compat";
import { SERVICE_LABELS, type ServiceType } from "@/types";
import { nextServiceState, type ServiceCycleState } from "@/lib/serviceCycle";
import { iconForServiceType } from "@/lib/serviceIconMap";
import { ServiceIcons } from "@/components/helix/ServiceIcons";
import { isServiceOverdue } from "@/lib/overdue";

type Tone = "neutral" | "progress" | "done";

const TONE_CLASS: Record<Tone, string> = {
  neutral:  "bg-bg-muted text-ink-2 border-line",
  progress: "bg-warning-bg text-warning-strong border-warning-bg",
  done:     "bg-success-bg text-success-strong border-success-bg",
};

const STATE_LABEL: Record<string, string> = {
  PENDING: "Pendiente",
  ARRIVED: "Aquí",
  DELIVERED: "Entregado",
};

function toneFor(state: string): Tone {
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
  onClick: () => void;
  disabled?: boolean;
}

function ServiceChip({ service, onClick, disabled }: ServiceChipProps) {
  const Icon = ServiceIcons[iconForServiceType(service.type)];
  const baseLabel =
    service.customName ||
    SERVICE_LABELS[service.type as ServiceType] ||
    service.type;
  const targetSuffix = service.target ? ` · ${TARGET_LABEL[service.target] ?? service.target}` : "";
  const overdue = isServiceOverdue(service);
  const tone = toneFor(service.state);
  const stateText = STATE_LABEL[service.state] ?? service.state;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onClick();
      }}
      className={`flex min-h-[48px] min-w-[88px] flex-col items-start justify-center gap-0.5 rounded-hx-md border px-2 py-1 text-left transition active:scale-95 disabled:cursor-default disabled:opacity-50 ${TONE_CLASS[tone]} ${overdue ? "overdue ring-2 ring-danger-strong" : ""}`}
      aria-label={`${baseLabel}${targetSuffix}: ${stateText}${overdue ? " (retrasado)" : ""}`}
      title={service.reference ? `#${service.reference}` : undefined}
    >
      <span className="flex items-center gap-1 text-[11px] font-semibold leading-none">
        <Icon width={14} height={14} />
        <span className="truncate max-w-[140px]">{baseLabel}{targetSuffix}</span>
      </span>
      <span className="text-[11px] font-mono leading-tight">
        {stateText}
        {overdue ? " ⚠" : ""}
      </span>
    </button>
  );
}

export interface ServiceChipRowProps {
  services: Service[];
  onToggle?: (serviceId: string, newState: ServiceCycleState) => void;
  readOnly?: boolean;
}

export function ServiceChipRow({ services, onToggle, readOnly = false }: ServiceChipRowProps) {
  if (services.length === 0) return null;
  const delivered = services.filter((s) => s.state === "DELIVERED").length;
  const disabled = readOnly || !onToggle;

  return (
    <div
      className="services-strip flex flex-wrap items-center gap-1.5 border-t border-line-subtle bg-bg px-2 py-2"
      onClick={(e) => e.stopPropagation()}
    >
      {services.map((s) => (
        <ServiceChip
          key={s.id}
          service={s}
          disabled={disabled}
          onClick={() => onToggle?.(s.id, nextServiceState(s.state))}
        />
      ))}
      <span className="ml-auto text-xs font-mono text-ink-muted">
        {delivered}/{services.length} servidos
      </span>
    </div>
  );
}
