import { describe, it, expect } from "vitest";
import { palmaDayUtc } from "./time";

describe("palmaDayUtc", () => {
  it("returns midnight UTC for a YYYY-MM-DD input (interpreted as Palma local date)", () => {
    const d = palmaDayUtc("2024-07-15");
    expect(d.toISOString()).toBe("2024-07-15T00:00:00.000Z");
  });

  it("returns midnight UTC of the Palma local day for a Date input", () => {
    // 2024-07-15 23:30 UTC is 01:30 next-day in Palma (CEST = UTC+2)
    const input = new Date("2024-07-15T23:30:00.000Z");
    const d = palmaDayUtc(input);
    expect(d.toISOString()).toBe("2024-07-16T00:00:00.000Z");
  });

  it("returns midnight UTC of the Palma local day during CET (winter)", () => {
    // 2024-01-15 23:30 UTC is 00:30 next-day in Palma (CET = UTC+1)
    const input = new Date("2024-01-15T23:30:00.000Z");
    const d = palmaDayUtc(input);
    expect(d.toISOString()).toBe("2024-01-16T00:00:00.000Z");
  });

  it("with no input returns midnight UTC of today (Palma)", () => {
    const d = palmaDayUtc();
    expect(d.getUTCHours()).toBe(0);
    expect(d.getUTCMinutes()).toBe(0);
    expect(d.getUTCSeconds()).toBe(0);
    expect(d.getUTCMilliseconds()).toBe(0);
  });
});
