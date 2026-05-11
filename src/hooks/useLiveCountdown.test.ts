import { describe, it, expect } from "vitest";
import { calcMinutes } from "./useLiveCountdown";

// Reproduces the bug observed in production on 2026-05-11 23:35 UTC:
// flights scheduled for 2026-05-12 morning showed +1000 min "delayed"
// because the calculation compared HH:MM-of-day across midnight without
// any date anchor.

describe("calcMinutes", () => {
  describe("with explicit dayUtc (the fix)", () => {
    it("returns positive minutes for a future flight tomorrow morning", () => {
      const now = new Date(Date.UTC(2026, 4, 11, 23, 35)); // May 11, 23:35 UTC
      const dayUtc = new Date(Date.UTC(2026, 4, 12, 0, 0)); // DaySheet for May 12
      // ETA 06:30Z on May 12 → in 6h55m = 415 min
      expect(calcMinutes("06:30", dayUtc, now)).toBe(415);
    });

    it("returns negative for a flight earlier today", () => {
      const now = new Date(Date.UTC(2026, 4, 12, 10, 0));
      const dayUtc = new Date(Date.UTC(2026, 4, 12, 0, 0));
      expect(calcMinutes("06:30", dayUtc, now)).toBe(-210);
    });

    it("handles overnight flights correctly (ETA past midnight UTC)", () => {
      const now = new Date(Date.UTC(2026, 4, 12, 22, 0));
      const dayUtc = new Date(Date.UTC(2026, 4, 12, 0, 0));
      // ETA 23:30Z on May 12 → in 1h30m = 90 min (NOT -1290)
      expect(calcMinutes("23:30", dayUtc, now)).toBe(90);
    });
  });

  describe("legacy fallback (no dayUtc) — wraps to nearest occurrence", () => {
    it("does NOT report 1000+ min late for tomorrow's morning flight", () => {
      const now = new Date(Date.UTC(2026, 4, 11, 23, 35));
      // Old buggy behaviour returned -1025; new heuristic returns +415
      const result = calcMinutes("06:30", null, now);
      expect(result).toBe(415);
    });

    it("treats a flight 11h in the future as future, not past", () => {
      const now = new Date(Date.UTC(2026, 4, 12, 12, 0));
      expect(calcMinutes("23:00", null, now)).toBe(660);
    });

    it("treats a recent past time as past, not future-tomorrow", () => {
      const now = new Date(Date.UTC(2026, 4, 12, 12, 0));
      expect(calcMinutes("11:00", null, now)).toBe(-60);
    });
  });

  it("returns null for invalid input", () => {
    expect(calcMinutes(null, null)).toBeNull();
    expect(calcMinutes(undefined, null)).toBeNull();
    expect(calcMinutes("", null)).toBeNull();
    expect(calcMinutes("not-a-time", null)).toBeNull();
  });
});
