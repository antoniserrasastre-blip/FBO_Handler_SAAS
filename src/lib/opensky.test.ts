import { describe, it, expect } from "vitest";
import { parseState } from "./opensky";

describe("parseState", () => {
  it("maps OpenSky tuple to typed state and trims callsign", () => {
    const tuple = [
      "4ca7b3",
      "RYR4521 ",
      "Ireland",
      1717000000,
      1717000005,
      2.7,
      39.5,
      1500,
      false,
      120.5,
      90,
      -3.2,
      null,
      1450,
      "7000",
      false,
      0,
    ] as const;
    const s = parseState(tuple as unknown as Parameters<typeof parseState>[0]);
    expect(s.icao24).toBe("4ca7b3");
    expect(s.callsign).toBe("RYR4521");
    expect(s.latitude).toBe(39.5);
    expect(s.longitude).toBe(2.7);
    expect(s.baroAltitudeM).toBe(1500);
    expect(s.onGround).toBe(false);
    expect(s.velocityMs).toBe(120.5);
    expect(s.verticalRateMs).toBe(-3.2);
    expect(s.geoAltitudeM).toBe(1450);
    expect(s.squawk).toBe("7000");
  });

  it("returns null callsign when empty", () => {
    const tuple = [
      "abc", "   ", "Spain", null, 0, null, null, null, true, null, null, null, null, null, null, false, 0,
    ] as const;
    const s = parseState(tuple as unknown as Parameters<typeof parseState>[0]);
    expect(s.callsign).toBeNull();
  });
});
