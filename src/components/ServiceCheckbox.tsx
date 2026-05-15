"use client";

import { Service } from "@/types/compat";
import { SERVICE_LABELS, ServiceType, SERVICE_TARGET_LABELS, ServiceTarget } from "@/types";
import { ServiceIcon, PendingIcon, ArrivedIcon, DeliveredIcon } from "./Icons";

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
  const nextState = NEXT_STATE[service.state] || "PENDING";

  const stateStyles: Record<string, string> = {
    PENDING: "bg-bg-muted text-ink-2 hover:bg-bg-sunken",
    ARRIVED: "bg-info-bg text-info-strong",
    DELIVERED: "bg-success-bg text-success-strong",
  };

  const StateIndicator = service.state === "DELIVERED" ? DeliveredIcon
    : service.state === "ARRIVED" ? ArrivedIcon
    : PendingIcon;

  return (
    <button
      onClick={() => onToggle(service.id, nextState)}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${stateStyles[service.state] || stateStyles.PENDING}`}
      title={`${label} — ${service.state === "PENDING" ? "Pendiente" : service.state === "ARRIVED" ? "Llegado" : "Entregado"}${service.reference ? ` (Ref: ${service.reference})` : ""}. Click para avanzar.`}
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
