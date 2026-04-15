"use client";

import { Service } from "@prisma/client";
import { SERVICE_ICONS, SERVICE_LABELS, ServiceType } from "@/types";

// 3-state cycle: PENDING → ARRIVED → DELIVERED → PENDING
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
  const icon = SERVICE_ICONS[service.type as ServiceType] || "🔧";
  const label = service.type === "CUSTOM"
    ? service.customName || "Extra"
    : SERVICE_LABELS[service.type as ServiceType] || service.type;
  const nextState = NEXT_STATE[service.state] || "PENDING";

  const stateStyles: Record<string, string> = {
    PENDING: "bg-gray-100 text-gray-600 hover:bg-gray-200",
    ARRIVED: "bg-blue-100 text-blue-700",
    DELIVERED: "bg-green-100 text-green-700",
  };

  const stateIndicator: Record<string, string> = {
    PENDING: "○",
    ARRIVED: "◐",
    DELIVERED: "✓",
  };

  return (
    <button
      onClick={() => onToggle(service.id, nextState)}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${stateStyles[service.state] || stateStyles.PENDING}`}
      title={`${label} — ${service.state === "PENDING" ? "Pendiente" : service.state === "ARRIVED" ? "Llegado" : "Entregado"}${service.reference ? ` (Ref: ${service.reference})` : ""}. Click para avanzar.`}
    >
      <span>{icon}</span>
      {stateIndicator[service.state] || "○"}
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
