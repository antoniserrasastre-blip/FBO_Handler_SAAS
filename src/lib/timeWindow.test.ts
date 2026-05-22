import { describe, it, expect } from "vitest";
import { isWithinHours, flightWithinHours } from "@/lib/timeWindow";

const NOW = new Date("2026-05-22T12:00:00Z");
const hoursFromNow = (h: number) => new Date(NOW.getTime() + h * 3600 * 1000);

describe("isWithinHours", () => {
  it("returns true for an instant 4h in the past with hours=8", () => {
    expect(isWithinHours(hoursFromNow(-4), 8, NOW)).toBe(true);
  });

  it("returns true for an instant 6h in the future with hours=8", () => {
    expect(isWithinHours(hoursFromNow(6), 8, NOW)).toBe(true);
  });

  it("returns false for an instant 10h in the past with hours=8", () => {
    expect(isWithinHours(hoursFromNow(-10), 8, NOW)).toBe(false);
  });

  it("returns false for an instant 12h in the future with hours=8", () => {
    expect(isWithinHours(hoursFromNow(12), 8, NOW)).toBe(false);
  });

  it("returns false for null", () => {
    expect(isWithinHours(null, 8, NOW)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isWithinHours(undefined, 8, NOW)).toBe(false);
  });

  it("returns false for invalid date string", () => {
    expect(isWithinHours("not-a-date", 8, NOW)).toBe(false);
  });

  it("accepts ISO string input (round-trip via toFlightView serialisation)", () => {
    const iso = hoursFromNow(-2).toISOString();
    expect(isWithinHours(iso, 8, NOW)).toBe(true);
  });

  it("is symmetric at the boundary", () => {
    expect(isWithinHours(hoursFromNow(8), 8, NOW)).toBe(true);
    expect(isWithinHours(hoursFromNow(-8), 8, NOW)).toBe(true);
  });
});

describe("flightWithinHours", () => {
  it("returns true when arrival is in the past 4h", () => {
    expect(
      flightWithinHours(
        { arrivalInstant: hoursFromNow(-4), departureInstant: null },
        8,
        NOW,
      ),
    ).toBe(true);
  });

  it("returns true when departure is 6h in the future", () => {
    expect(
      flightWithinHours(
        { arrivalInstant: null, departureInstant: hoursFromNow(6) },
        8,
        NOW,
      ),
    ).toBe(true);
  });

  it("returns false when arrival is 10h ago and there is no departure", () => {
    expect(
      flightWithinHours(
        { arrivalInstant: hoursFromNow(-10), departureInstant: null },
        8,
        NOW,
      ),
    ).toBe(false);
  });

  it("returns false when both instants are null", () => {
    expect(
      flightWithinHours({ arrivalInstant: null, departureInstant: null }, 8, NOW),
    ).toBe(false);
  });

  it("returns true when arrival is out of range but departure is in range", () => {
    expect(
      flightWithinHours(
        {
          arrivalInstant: hoursFromNow(-20),
          departureInstant: hoursFromNow(2),
        },
        8,
        NOW,
      ),
    ).toBe(true);
  });

  it("accepts ISO string instants (wire format)", () => {
    expect(
      flightWithinHours(
        {
          arrivalInstant: hoursFromNow(-3).toISOString(),
          departureInstant: hoursFromNow(5).toISOString(),
        },
        8,
        NOW,
      ),
    ).toBe(true);
  });
});
