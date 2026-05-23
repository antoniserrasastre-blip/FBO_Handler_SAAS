import { describe, it, expect } from "vitest";
import { parsePosts, serializePosts } from "./shift";

describe("parsePosts", () => {
  it("parses a comma-separated list of valid posts", () => {
    expect(parsePosts("ARRIVALS,DEPARTURES")).toEqual(["ARRIVALS", "DEPARTURES"]);
  });

  it("trims whitespace around values", () => {
    expect(parsePosts(" RAMP , RUNNER ")).toEqual(["RAMP", "RUNNER"]);
  });

  it("discards unknown values", () => {
    expect(parsePosts("ARRIVALS,FOO")).toEqual(["ARRIVALS"]);
  });

  it("returns empty array for empty string", () => {
    expect(parsePosts("")).toEqual([]);
  });
});

describe("serializePosts", () => {
  it("dedups repeated values", () => {
    expect(serializePosts(["RAMP", "RAMP"])).toBe("RAMP");
  });

  it("keeps SHIFT_POSTS order regardless of input order", () => {
    expect(serializePosts(["DEPARTURES", "RAMP"])).toBe("RAMP,DEPARTURES");
  });
});

describe("round-trip", () => {
  it("serialize → parse returns the canonical list", () => {
    const csv = serializePosts(["DEPARTURES", "ARRIVALS", "ARRIVALS"]);
    expect(parsePosts(csv)).toEqual(["ARRIVALS", "DEPARTURES"]);
  });
});
