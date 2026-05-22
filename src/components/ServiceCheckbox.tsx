"use client";

import { Service } from "@/types/compat";
import { SERVICE_LABELS, ServiceType, SERVICE_TARGET_LABELS, ServiceTarget } from "@/types";
import { ServiceIcon, PendingIcon, ArrivedIcon, DeliveredIcon } from "./Icons";
import { useLongPress } from "@/hooks/useLongPress";

// Ciclo de tap corto: PENDING → ARRIVED → DELIVERED → PENDING.
// Long-press: cualquier estado activo → CANCELLED; CANCELLED → PENDING.
const NEXT_STATE: Record<string, string> = {
  PENDING: "ARRIVED",
  ARRIVED: "DELIVERED",
  DELIVERED: "PENDING",
};

interface ServiceCheckboxProps {
  service: Service;
  onToggle: (serviceId: string, newState: string) => void;
}

export function ServiceCheckbox({ service, onToggle }: ServiceCheckboxProps) {
  const label = service.type === "CUSTOM"
    ? service.customName || "Extra"
    : SERVICE_LABELS[service.type as ServiceType] || service.type;
  const isCancelled = service.state === "CANCELLED";
  const nextState = NEXT_STATE[service.state] || "PENDING";

  const stateStyles: Record<string, string> = {
    PENDING:   "bg-bg-muted text-ink-2 hover:bg-bg-sunken",
    ARRIVED:   "bg-info-bg text-info-strong",
    DELIVERED: "bg-success-bg text-success-strong",
    CANCELLED: "bg-bg-muted text-ink-disabled line-through opacity-60",
  };

  const StateIndicator = service.state === "DELIVERED" ? DeliveredIcon
    : service.state === "ARRIVED" ? ArrivedIcon
    : PendingIcon;

  const { handlers, isPressing } = useLongPress({
    onLongPress: () => onToggle(service.id, isCancelled ? "PENDING" : "CANCELLED"),
    onClick: () => {
      if (isCancelled) return; // sólo long-press restaura
      onToggle(service.id, nextState);
    },
  });

  const stateText =
    service.state === "PENDING" ? "Pendiente" :
    service.state === "ARRIVED" ? "Llegado" :
    service.state === "DELIVERED" ? "Entregado" :
    service.state === "CANCELLED" ? "Cancelado" : service.state;
  const ariaHint = isCancelled ? "Mantén pulsado para restaurar" : "Mantén pulsado para cancelar";

  return (
    <button
      type="button"
      {...handlers}
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${stateStyles[service.state] || stateStyles.PENDING} ${isPressing ? "scale-95 ring-2 ring-danger-strong/40" : ""}`}
      style={{ touchAction: "manipulation" }}
      title={`${label} — ${stateText}${service.reference ? ` (Ref: ${service.reference})` : ""}. ${ariaHint}.`}
      aria-label={`${label}: ${stateText}. ${ariaHint}.`}
    >
      <ServiceIcon type={service.type} size={12} />
      <StateIndicator size={12} />
      {service.target && (
        <span className="text-[10px] font-bold opacity-80">
          {SERVICE_TARGET_LABELS[service.target as ServiceTarget] || service.target}
        </span>
      )}
      {service.reference && <span className="text-[10px] opacity-60">#{service.reference}</span>}
      {service.deliveredAt && service.state === "DELIVERED" && (
        <span className="text-[10px] opacity-70">{service.deliveredAt}</span>
      )}
    </button>
  );
}

export function ServiceBadges({
  services,
  onToggle,
}: {
  services: Service[];
  onToggle: (serviceId: string, newState: string) => void;
}) {
  if (services.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {services.map((service) => (
        <ServiceCheckbox key={service.id} service={service} onToggle={onToggle} />
      ))}
    </div>
  );
}
