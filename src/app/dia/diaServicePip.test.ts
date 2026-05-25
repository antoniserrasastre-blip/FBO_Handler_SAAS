/**
 * diaServicePip.test.ts — Characterisation of the catering pip bug in /dia
 *
 * BUG LOCATION: src/app/dia/page.tsx
 *
 *   Line 59 (servicePip):
 *     const svc = flight.services.find((s) => s.type === type);
 *   Line 188 (cycleCateringService):
 *     const svc = f.services.find((s) => s.type === "CATERING");
 *
 * BOTH functions use `.find()`, which returns the FIRST matching service and
 * ignores all subsequent services of the same type. For a visit that carries
 * two CATERING services (e.g. one CREW catering PENDING + one PAX catering
 * DELIVERED), `servicePip` reports the state of whichever happens to be first
 * in the array, not the combined state of all caterings.
 *
 * Similarly `cycleCateringService` cycles only the first catering service —
 * the second one is never touched from the pip click.
 *
 * DESIGN NOTE:
 *   Both functions are PRIVATE closures inside `DiaPageInner()` in page.tsx.
 *   They are not exported, so they cannot be imported and unit-tested in
 *   isolation. This is a design issue: extracting them as pure functions to
 *   a helper module (e.g. diaHelpers.ts) would make them trivially testable
 *   and is the recommended fix path.
 *
 *   For now this file characterises the bug via the PURE DATA LAYER:
 *   - servicePip-equivalent logic is re-implemented here verbatim to pin the
 *     current behaviour so any fix is visible as a test diff.
 *   - The re-implementation deliberately mirrors the source code exactly.
 *
 * TO FIX: change servicePip and cycleCateringService to consider ALL services
 *         of the given type, not just the first. A sensible aggregation is:
 *           - pip shows "ok" only when ALL caterings are delivered
 *           - pip shows "req" when at least one is arrived/requested
 *           - pip shows "no" when at least one is pending
 *           - pip shows "hide" when there are no caterings
 */

import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Re-implementation of servicePip verbatim (from page.tsx lines 58-64)
// This is intentionally an exact copy so the test pins the current buggy code.
// ---------------------------------------------------------------------------

type PipState = "ok" | "req" | "no" | "hide";
type ServiceLike = { type: string; state: string };

/** CURRENT (buggy) implementation — uses .find() → only first service. */
function servicePipCurrent(services: ServiceLike[], type: string): PipState {
  const svc = services.find((s) => s.type === type);
  if (!svc) return "hide";
  if (svc.state === "DELIVERED" || svc.state === "COMPLETED" || svc.state === "SERVED") return "ok";
  if (svc.state === "ARRIVED" || svc.state === "REQUESTED") return "req";
  return "no";
}

// ---------------------------------------------------------------------------
// BUG CHARACTERISATION: single-catering baseline (correct behaviour)
// ---------------------------------------------------------------------------

describe("servicePip (current behaviour) — single CATERING service", () => {
  it("returns hide when no services exist", () => {
    expect(servicePipCurrent([], "CATERING")).toBe("hide");
  });

  it("returns no when the only catering is PENDING", () => {
    expect(servicePipCurrent([{ type: "CATERING", state: "PENDING" }], "CATERING")).toBe("no");
  });

  it("returns req when the only catering is ARRIVED", () => {
    expect(servicePipCurrent([{ type: "CATERING", state: "ARRIVED" }], "CATERING")).toBe("req");
  });

  it("returns ok when the only catering is DELIVERED", () => {
    expect(servicePipCurrent([{ type: "CATERING", state: "DELIVERED" }], "CATERING")).toBe("ok");
  });

  it("returns ok for COMPLETED (legacy catering state alias)", () => {
    expect(servicePipCurrent([{ type: "CATERING", state: "COMPLETED" }], "CATERING")).toBe("ok");
  });

  it("returns hide when no CATERING present (only WATER)", () => {
    expect(servicePipCurrent([{ type: "WATER", state: "ARRIVED" }], "CATERING")).toBe("hide");
  });
});

// ---------------------------------------------------------------------------
// BUG CHARACTERISATION: two-catering scenario (the broken case)
//
// A visit has TWO catering services:
//   [0] CREW catering → PENDING   (not yet done)
//   [1] PAX  catering → DELIVERED (done)
//
// EXPECTED (correct) pip: "no" — because at least one catering is not done.
// ACTUAL (buggy) pip:     "no" — happens to be correct HERE only because
//                                 CREW (PENDING) comes first in the array.
//
// The pip result is ARRAY-ORDER DEPENDENT, not semantically correct.
// ---------------------------------------------------------------------------

describe("servicePip (current behaviour) — two CATERING services (BUG: array-order dependent)", () => {
  const crewPending = { type: "CATERING", state: "PENDING" };
  const paxDelivered = { type: "CATERING", state: "DELIVERED" };

  it("[CREW PENDING, PAX DELIVERED] → pip shows no (first service wins)", () => {
    // Current: .find() picks crewPending (index 0). State=PENDING → "no".
    // This HAPPENS to be a meaningful result, but only because PENDING is first.
    expect(servicePipCurrent([crewPending, paxDelivered], "CATERING")).toBe("no");
  });

  it("[PAX DELIVERED, CREW PENDING] → pip shows ok — BUG: ignores the pending catering", () => {
    // Current: .find() picks paxDelivered (index 0). State=DELIVERED → "ok".
    // BUG: the CREW catering is still PENDING but the pip claims everything is done.
    // If the array were reversed (PAX first), the handler sees a GREEN pip even though
    // the CREW catering hasn't arrived yet.
    //
    // This test is GREEN because it documents the CURRENT buggy behaviour.
    // When the bug is fixed, this test should be CHANGED to expect "no".
    expect(servicePipCurrent([paxDelivered, crewPending], "CATERING")).toBe("ok"); // BUG: should be "no"
  });

  it("[CREW ARRIVED, PAX PENDING] → pip shows req (first service wins)", () => {
    const crewArrived = { type: "CATERING", state: "ARRIVED" };
    const paxPending = { type: "CATERING", state: "PENDING" };
    // .find() picks crewArrived → "req". The PAX catering (PENDING) is invisible.
    expect(servicePipCurrent([crewArrived, paxPending], "CATERING")).toBe("req");
  });

  it("[PAX PENDING, CREW ARRIVED] → pip shows no — BUG: misses the ARRIVED catering", () => {
    const paxPending = { type: "CATERING", state: "PENDING" };
    const crewArrived = { type: "CATERING", state: "ARRIVED" };
    // .find() picks paxPending → "no". The CREW catering that has ARRIVED is invisible.
    // BUG: handler should see "req" (at least one arrived) but sees "no" (pending).
    //
    // This test is GREEN (documents current behaviour).
    // When the bug is fixed, this test should be CHANGED to expect "req".
    expect(servicePipCurrent([paxPending, crewArrived], "CATERING")).toBe("no"); // BUG: should be "req"
  });
});

// ---------------------------------------------------------------------------
// BUG CHARACTERISATION: cycleCateringService — only first catering is cycled
//
// cycleCateringService (page.tsx line 188) uses:
//   const svc = f.services.find((s) => s.type === "CATERING");
//
// With two caterings, clicking the pip ONLY cycles the first one.
// The second catering is never touched from the pip click in /dia.
//
// We characterise this via the same data-logic pattern: which service id
// would be selected and mutated.
// ---------------------------------------------------------------------------

describe("cycleCateringService (current behaviour) — only first catering cycled (BUG)", () => {
  it("with two caterings, .find() always picks the first one by insertion order", () => {
    const services = [
      { id: "svc-crew", type: "CATERING", state: "PENDING" },
      { id: "svc-pax",  type: "CATERING", state: "PENDING" },
    ];
    // Mirrors: const svc = f.services.find((s) => s.type === "CATERING");
    const svc = services.find((s) => s.type === "CATERING");
    // Current behaviour: always the first one.
    expect(svc!.id).toBe("svc-crew");
    // BUG: svc-pax is never cycled from the pip click in /dia.
    // Fix would require cycling ALL caterings, or surfacing a UI that disambiguates.
  });

  it("reversing the array changes which catering gets cycled — confirms order-dependency", () => {
    const services = [
      { id: "svc-pax",  type: "CATERING", state: "PENDING" },
      { id: "svc-crew", type: "CATERING", state: "PENDING" },
    ];
    const svc = services.find((s) => s.type === "CATERING");
    // After reversal, svc-pax is cycled instead of svc-crew.
    expect(svc!.id).toBe("svc-pax");
  });
});

// ---------------------------------------------------------------------------
// WHAT CORRECT BEHAVIOUR LOOKS LIKE (not implemented yet)
//
// These tests describe a correct multi-catering pip aggregation.
// They use a PROPOSED correct implementation to make them green — this block
// documents the TARGET behaviour so the fix author has a spec to aim for.
// ---------------------------------------------------------------------------

/** PROPOSED correct implementation (multi-catering aware). Not yet in production. */
function servicePipCorrect(services: ServiceLike[], type: string): PipState {
  const relevant = services.filter((s) => s.type === type);
  if (relevant.length === 0) return "hide";
  if (relevant.every((s) => s.state === "DELIVERED" || s.state === "COMPLETED" || s.state === "SERVED")) return "ok";
  if (relevant.some((s) => s.state === "ARRIVED" || s.state === "REQUESTED")) return "req";
  return "no";
}

describe("servicePip PROPOSED correct behaviour — multi-catering aware", () => {
  it("[CREW PENDING, PAX DELIVERED] → no (not all done)", () => {
    expect(servicePipCorrect(
      [{ type: "CATERING", state: "PENDING" }, { type: "CATERING", state: "DELIVERED" }],
      "CATERING",
    )).toBe("no");
  });

  it("[PAX DELIVERED, CREW PENDING] → no regardless of order (fixed bug)", () => {
    expect(servicePipCorrect(
      [{ type: "CATERING", state: "DELIVERED" }, { type: "CATERING", state: "PENDING" }],
      "CATERING",
    )).toBe("no");
  });

  it("[CREW ARRIVED, PAX PENDING] → req (at least one arrived)", () => {
    expect(servicePipCorrect(
      [{ type: "CATERING", state: "ARRIVED" }, { type: "CATERING", state: "PENDING" }],
      "CATERING",
    )).toBe("req");
  });

  it("[PAX PENDING, CREW ARRIVED] → req regardless of order (fixed bug)", () => {
    expect(servicePipCorrect(
      [{ type: "CATERING", state: "PENDING" }, { type: "CATERING", state: "ARRIVED" }],
      "CATERING",
    )).toBe("req");
  });

  it("[CREW DELIVERED, PAX DELIVERED] → ok (all done)", () => {
    expect(servicePipCorrect(
      [{ type: "CATERING", state: "DELIVERED" }, { type: "CATERING", state: "DELIVERED" }],
      "CATERING",
    )).toBe("ok");
  });
});
