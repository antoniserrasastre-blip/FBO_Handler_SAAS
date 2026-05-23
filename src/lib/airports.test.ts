import { describe, it, expect } from "vitest";
import { getAirportInfo } from "./airports";

describe("getAirportInfo", () => {
  it("returns Palma for LEPA", () => {
    const info = getAirportInfo("LEPA");
    expect(info).not.toBeNull();
    expect(info!.city).toBe("Palma de Mallorca");
    expect(info!.name).toBe("Son Sant Joan");
  });

  it("is case-insensitive", () => {
    const info = getAirportInfo("lepa");
    expect(info).not.toBeNull();
    expect(info!.city).toBe("Palma de Mallorca");
  });

  it("trims whitespace", () => {
    const info = getAirportInfo("  LFPB  ");
    expect(info).not.toBeNull();
    expect(info!.city).toBe("París");
    expect(info!.name).toBe("Le Bourget");
  });

  it("returns null for unknown ICAO", () => {
    expect(getAirportInfo("ZZZZ")).toBeNull();
  });

  it("returns null for null", () => {
    expect(getAirportInfo(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(getAirportInfo(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(getAirportInfo("")).toBeNull();
  });
});
