// Service state machine for the ad-hoc service catalog (CATERING, WATER,
// GPU, …). The cycle is intentionally simple — the handler ticks once per
// step and wraps around on the third click to recover from mis-ticks.
//
//   PENDING ──► ARRIVED ──► DELIVERED ──► PENDING (reset)
//
// Anything outside the cycle (legacy NOT_REQUESTED, empty, future enum
// values) is treated as PENDING so the first click always starts the cycle.

import type { ServicePipState } from "@/components/helix/ServicePip";

export type ServiceCycleState = "PENDING" | "ARRIVED" | "DELIVERED";

export function nextServiceState(current: string): ServiceCycleState {
  if (current === "PENDING") return "ARRIVED";
  if (current === "ARRIVED") return "DELIVERED";
  if (current === "DELIVERED") return "PENDING";
  return "PENDING";
}

export function pipStateFor(current: string): ServicePipState {
  if (current === "DELIVERED") return "ok";
  if (current === "ARRIVED") return "req";
  return "no";
}
