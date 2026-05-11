import { describe, it, expect } from "vitest";
import { OpenSkyState } from "./opensky";
import {
  normaliseCallsign,
  computePhase,
  indexByCallsign,
  matchFlights,
} from "./liveTracking";

function mkState(partial: Partial<OpenSkyState>): OpenSkyState {
  return {
    icao24: "abc123",
    callsign: "TEST1",
    originCountry: "Spain",
    timePosition: 0,
    lastContact: 0,
    longitude: 2.7,
    latitude: 39.5,
    baroAltitudeM: 1000,
    onGround: false,
    velocityMs: 100,
    trueTrack: 90,
    verticalRateMs: 0,
    geoAltitudeM: 1000,
    squawk: null,
    spi: false,
    positionSource: 0,
    ...partial,
  };
}

describe("normaliseCallsign", () => {
  it("uppercases and strips non-alphanumeric", () => {
    expect(normaliseCallsign(" ryr4521 ")).toBe("RYR4521");
    expect(normaliseCallsign("AF-123")).toBe("AF123");
    expect(normaliseCallsign(null)).toBe("");
    expect(normaliseCallsign("")).toBe("");
  });
});

describe("computePhase", () => {
  it("returns ON_BLOCKS when on ground and stopped", () => {
    expect(computePhase(mkState({ onGround: true, velocityMs: 0 }))).toBe("ON_BLOCKS");
    expect(computePhase(mkState({ onGround: true, velocityMs: 1.5 }))).toBe("ON_BLOCKS");
  });

  it("returns LANDED when on ground and taxiing", () => {
    expect(computePhase(mkState({ onGround: true, velocityMs: 10 }))).toBe("LANDED");
  });

  it("returns APPROACHING when descending in the air", () => {
    expect(computePhase(mkState({ onGround: false, verticalRateMs: -5, baroAltitudeM: 3000 }))).toBe("APPROACHING");
  });

  it("returns APPROACHING when airborne and low", () => {
    expect(computePhase(mkState({ onGround: false, verticalRateMs: 0, baroAltitudeM: 800 }))).toBe("APPROACHING");
  });

  it("returns DEPARTED when airborne and climbing/cruising", () => {
    expect(computePhase(mkState({ onGround: false, verticalRateMs: 5, baroAltitudeM: 5000 }))).toBe("DEPARTED");
    expect(computePhase(mkState({ onGround: false, verticalRateMs: 0, baroAltitudeM: 10000 }))).toBe("DEPARTED");
  });
});

describe("indexByCallsign", () => {
  it("keeps the freshest state per callsign", () => {
    const stale = mkState({ callsign: "RYR1", lastContact: 100, icao24: "old" });
    const fresh = mkState({ callsign: "RYR1", lastContact: 200, icao24: "new" });
    const idx = indexByCallsign([stale, fresh]);
    expect(idx.get("RYR1")?.icao24).toBe("new");
  });

  it("ignores states with no callsign", () => {
    const idx = indexByCallsign([mkState({ callsign: null })]);
    expect(idx.size).toBe(0);
  });
});

describe("matchFlights", () => {
  it("matches by normalised callsign and flags phase change", () => {
    const states = [mkState({ callsign: "RYR4521 ", onGround: true, velocityMs: 0 })];
    const flights = [
      { id: "f1", callsign: "ryr4521", livePhase: "APPROACHING" },
      { id: "f2", callsign: "FR4521", livePhase: null }, // commercial number, won't match ICAO callsign
    ];
    const matches = matchFlights(flights, states);
    expect(matches).toHaveLength(1);
    expect(matches[0].flightId).toBe("f1");
    expect(matches[0].phase).toBe("ON_BLOCKS");
    expect(matches[0].phaseChanged).toBe(true);
  });

  it("does not flag phaseChanged when phase is the same", () => {
    const states = [mkState({ callsign: "EJU1", onGround: true, velocityMs: 0 })];
    const flights = [{ id: "f1", callsign: "EJU1", livePhase: "ON_BLOCKS" }];
    const matches = matchFlights(flights, states);
    expect(matches[0].phaseChanged).toBe(false);
  });
});
