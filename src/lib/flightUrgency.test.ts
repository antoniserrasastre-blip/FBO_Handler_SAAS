import { describe, it, expect } from "vitest";
import {
  isArrivalComplete,
  isDepartureReady,
  type FlightLike,
  type ServiceLike,
} from "@/lib/flightUrgency";

const readyFlight: Pick<FlightLike, "fuelState" | "toiletState"> = {
  fuelState: "SERVED",
  toiletState: "COMPLETED",
};

describe("isArrivalComplete — CANCELLED services do not block", () => {
  it("treats a CANCELLED arrival service as done-equivalent", () => {
    const services: ServiceLike[] = [
      { direction: "ARRIVAL", state: "CANCELLED" },
      { direction: "ARRIVAL", state: "DELIVERED" },
    ];
    expect(isArrivalComplete(readyFlight, services)).toBe(true);
  });

  it("still blocks when an arrival service is PENDING", () => {
    const services: ServiceLike[] = [
      { direction: "ARRIVAL", state: "PENDING" },
      { direction: "ARRIVAL", state: "CANCELLED" },
    ];
    expect(isArrivalComplete(readyFlight, services)).toBe(false);
  });
});

describe("isDepartureReady — CANCELLED services do not block", () => {
  it("treats a CANCELLED departure service as done-equivalent", () => {
    const services: ServiceLike[] = [
      { direction: "DEPARTURE", state: "CANCELLED" },
      { direction: "DEPARTURE", state: "DELIVERED" },
    ];
    expect(isDepartureReady(services)).toBe(true);
  });

  it("still blocks when a departure service is ARRIVED but not yet DELIVERED", () => {
    const services: ServiceLike[] = [
      { direction: "DEPARTURE", state: "ARRIVED" },
      { direction: "DEPARTURE", state: "CANCELLED" },
    ];
    expect(isDepartureReady(services)).toBe(false);
  });
});
