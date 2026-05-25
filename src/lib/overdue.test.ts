import { describe, it, expect } from "vitest";
import { isServiceOverdue } from "./overdue";

// These tests inject explicit UTC instants so the result is independent
// of the process TZ. A service at "08:00" Madrid time:
//   - In summer (CEST, UTC+2): 08:00 Madrid = 06:00Z
//   - A "now" of 08:30 Madrid = 06:30Z  → 30 min past schedule → overdue (>15 min threshold)
//   - A "now" of 08:10 Madrid = 06:10Z  → 10 min past schedule → not overdue (≤15 min threshold)

const SUMMER_NOW_OVERDUE = new Date("2026-07-15T06:30:00Z");  // Madrid 08:30 CEST
const SUMMER_NOW_NOT_YET = new Date("2026-07-15T06:10:00Z");  // Madrid 08:10 CEST

describe("isServiceOverdue", () => {
  describe("with scheduledAt field", () => {
    it("returns true when now is >15 min past the scheduled time (summer CEST)", () => {
      const service = { state: "PENDING", scheduledAt: "08:00" };
      expect(isServiceOverdue(service, 15, SUMMER_NOW_OVERDUE)).toBe(true);
    });

    it("returns false when now is ≤15 min past the scheduled time (summer CEST)", () => {
      const service = { state: "PENDING", scheduledAt: "08:00" };
      expect(isServiceOverdue(service, 15, SUMMER_NOW_NOT_YET)).toBe(false);
    });
  });

  describe("with time embedded in customName", () => {
    it("returns true when now is >15 min past the embedded time", () => {
      const service = { state: "PENDING", scheduledAt: null, customName: "Catering 08:00" };
      expect(isServiceOverdue(service, 15, SUMMER_NOW_OVERDUE)).toBe(true);
    });

    it("returns false when now is ≤15 min past the embedded time", () => {
      const service = { state: "PENDING", scheduledAt: null, customName: "Catering 08:00" };
      expect(isServiceOverdue(service, 15, SUMMER_NOW_NOT_YET)).toBe(false);
    });
  });

  describe("state checks", () => {
    it("returns false for DELIVERED services regardless of time", () => {
      const service = { state: "DELIVERED", scheduledAt: "08:00" };
      // Even though now is way past schedule, delivered services are never overdue
      expect(isServiceOverdue(service, 15, SUMMER_NOW_OVERDUE)).toBe(false);
    });

    it("returns false when no time information is available", () => {
      const service = { state: "PENDING", scheduledAt: null, customName: "Sin hora" };
      expect(isServiceOverdue(service, 15, SUMMER_NOW_OVERDUE)).toBe(false);
    });
  });

  describe("winter (CET = UTC+1)", () => {
    // Service at "08:00" CET = 07:00Z; now 08:30 CET = 07:30Z → 30 min → overdue
    it("returns true in winter when >15 min past schedule", () => {
      const winterNowOverdue = new Date("2026-01-15T07:30:00Z"); // Madrid 08:30 CET
      const service = { state: "PENDING", scheduledAt: "08:00" };
      expect(isServiceOverdue(service, 15, winterNowOverdue)).toBe(true);
    });

    it("returns false in winter when ≤15 min past schedule", () => {
      const winterNowNotYet = new Date("2026-01-15T07:10:00Z"); // Madrid 08:10 CET
      const service = { state: "PENDING", scheduledAt: "08:00" };
      expect(isServiceOverdue(service, 15, winterNowNotYet)).toBe(false);
    });
  });
});
