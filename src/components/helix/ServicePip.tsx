import { HTMLAttributes } from "react";
import { ServiceIcons, ServiceKey, ServiceLabels } from "./ServiceIcons";

export type ServicePipState = "ok" | "req" | "no";

export interface ServicePipProps extends HTMLAttributes<HTMLSpanElement> {
  service: ServiceKey;
  state?: ServicePipState;
  size?: "sm" | "md" | "lg";
}

const stateClass: Record<ServicePipState, string> = {
  ok: "hx-pip-ok",
  req: "hx-pip-req",
  no: "hx-pip-no",
};

const sizeClass = {
  sm: "hx-pip-sm",
  md: "",
  lg: "hx-pip-lg",
};

export function ServicePip({
  service,
  state = "no",
  size = "md",
  className = "",
  title,
  ...rest
}: ServicePipProps) {
  const Icon = ServiceIcons[service];
  return (
    <span
      className={`hx-pip ${stateClass[state]} ${sizeClass[size]} ${className}`}
      title={title ?? ServiceLabels[service]}
      {...rest}
    >
      <Icon />
    </span>
  );
}
