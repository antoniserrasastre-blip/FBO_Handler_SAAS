import { describe, it, expect } from "vitest";
import { isFlightPending } from "@/lib/pendingFilter";

// Minimal flight shape that satisfies `FlightLike` from pendingFilter.
// We construct each test case with a clean baseline (everything served /
// completed / undefined transport) and override only the fields under test.
const clean = {
  state: "ON_BLOCKS",
  fuelState: "SERVED",
  toiletState: "COMPLETED",
  paxArrTransportState: "CONFIRMED",
  paxArrTransportType: "UNDEFINED",
  paxDepTransportState: "CONFIRMED",
  paxDepTransportType: "UNDEFINED",
  services: [] as { state: string }[],
};

describe("isFlightPending — despatched short-circuits", () => {
  it("returns false for OFF_BLOCKS even with a PENDING service", () => {
    expect(
      isFlightPending({
        ...clean,
        state: "OFF_BLOCKS",
        services: [{ state: "PENDING" }],
      }),
    ).toBe(false);
  });

  it("returns false for legacy DISPATCHED (normalised to OFF_BLOCKS)", () => {
    expect(
      isFlightPending({
        ...clean,
        state: "DISPATCHED",
        services: [{ state: "PENDING" }],
      }),
    ).toBe(false);
  });
});

describe("isFlightPending — service states", () => {
  it("returns false when all services are CANCELLED", () => {
    expect(
      isFlightPending({
        ...clean,
        services: [{ state: "CANCELLED" }, { state: "CANCELLED" }],
      }),
    ).toBe(false);
  });

  it("returns true when one service is PENDING", () => {
    expect(
      isFlightPending({
        ...clean,
        services: [{ state: "DELIVERED" }, { state: "PENDING" }],
      }),
    ).toBe(true);
  });

  it("returns true when one service is ARRIVED", () => {
    expect(
      isFlightPending({
        ...clean,
        services: [{ state: "ARRIVED" }],
      }),
    ).toBe(true);
  });
});

describe("isFlightPending — fuel / toilet", () => {
  it("returns true when fuel is REQUESTED", () => {
    expect(isFlightPending({ ...clean, fuelState: "REQUESTED" })).toBe(true);
  });

  it("returns true ON_BLOCKS with fuel NOT_REQUESTED", () => {
    expect(
      isFlightPending({
        ...clean,
        state: "ON_BLOCKS",
        fuelState: "NOT_REQUESTED",
      }),
    ).toBe(true);
  });

  it("returns false EXPECTED with fuel NOT_REQUESTED (no calzos todavía)", () => {
    expect(
      isFlightPending({
        ...clean,
        state: "EXPECTED",
        fuelState: "NOT_REQUESTED",
      }),
    ).toBe(false);
  });

  it("returns true when toilet is REQUESTED", () => {
    expect(isFlightPending({ ...clean, toiletState: "REQUESTED" })).toBe(true);
  });
});

describe("isFlightPending — transport gated by type", () => {
  it("returns false when arrival transport PENDING but type UNDEFINED", () => {
    expect(
      isFlightPending({
        ...clean,
        paxArrTransportState: "PENDING",
        paxArrTransportType: "UNDEFINED",
      }),
    ).toBe(false);
  });

  it("returns true when arrival transport PENDING with a real type", () => {
    expect(
      isFlightPending({
        ...clean,
        paxArrTransportState: "PENDING",
        paxArrTransportType: "TAXI",
      }),
    ).toBe(true);
  });

  it("returns true when departure transport PENDING with a real type", () => {
    expect(
      isFlightPending({
        ...clean,
        paxDepTransportState: "PENDING",
        paxDepTransportType: "RENTAL_CAR",
      }),
    ).toBe(true);
  });
});

describe("isFlightPending — clean flight", () => {
  it("returns false when everything is served / delivered", () => {
    expect(
      isFlightPending({
        ...clean,
        services: [{ state: "DELIVERED" }, { state: "DELIVERED" }],
      }),
    ).toBe(false);
  });
});
