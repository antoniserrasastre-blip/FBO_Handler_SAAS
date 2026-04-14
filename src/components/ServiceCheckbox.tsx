"use client";

import { Service } from "@prisma/client";
import { SERVICE_ICONS, SERVICE_LABELS, ServiceType } from "@/types";

interface ServiceCheckboxProps {
  service: Service;
  onToggle: (serviceId: string, newState: "PENDING" | "DELIVERED") => void;
}

export function ServiceCheckbox({ service, onToggle }: ServiceCheckboxProps) {
  const icon = SERVICE_ICONS[service.type as ServiceType] || "🔧";
  const label = service.type === "CUSTOM"
    ? service.customName || "Extra"
    : SERVICE_LABELS[service.type as ServiceType] || service.type;
  const isDelivered = service.state === "DELIVERED";

  return (
    <button
      onClick={() => onToggle(service.id, isDelivered ? "PENDING" : "DELIVERED")}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
        isDelivered
          ? "bg-green-100 text-green-700"
          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
      }`}
      title={
        isDelivered
          ? `${label} - entregado${service.deliveredAt ? ` a las ${service.deliveredAt}` : ""}`
          : `${label} - pendiente`
      }
    >
      <span>{icon}</span>
      {isDelivered ? "✓" : "○"}
      {service.deliveredAt && isDelivered && (
        <span className="text-[10px] opacity-70">{service.deliveredAt}</span>
      )}
    </button>
  );
}

// Compact version for collapsed card
export function ServiceBadges({
  services,
  onToggle,
}: {
  services: Service[];
  onToggle: (serviceId: string, newState: "PENDING" | "DELIVERED") => void;
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
