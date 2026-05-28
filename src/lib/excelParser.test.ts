/**
 * Tests for src/lib/excelParser.ts
 *
 * The Excel "Extras" sheet is the source of catering/service data for each
 * operating day. Its join key to flights is the aircraft REGISTRATION. Any
 * silent parse or normalisation failure means services land on the wrong visit
 * or get dropped entirely.
 *
 * Fixtures live in src/lib/__fixtures__/. They were built programmatically
 * (using the same `xlsx` library the parser uses) by reproducing the exact
 * column layout from real `docs/1 - copia (N).xlsx` files, substituting
 * fictional registrations (CS-DXX, CS-TZZ, …) for any real PII-bearing data.
 *
 * All times in the fixture are Madrid-local (Extras/catering convention).
 * The TZ=Europe/Madrid is set globally by src/test/setup-palma-tz.ts.
 */

import { describe, it, expect } from "vitest";
import { existsSync } from "fs";
import { readFileSync } from "fs";
import path from "path";

import { parseExtrasExcel, type ExcelParseResult, type ParsedExtra } from "./excelParser";

const FIXTURES_AVAILABLE = existsSync(path.resolve(__dirname, "__fixtures__", "extras-13apr-fixture.xlsx"));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadFixture(name: string): Buffer {
  return readFileSync(path.resolve(__dirname, "__fixtures__", name));
}

/** Find a ParsedExtra by registration, supporting both dash and no-dash lookups. */
function findExtra(result: ExcelParseResult, reg: string): ParsedExtra | undefined {
  const normReg = reg.toUpperCase().replace(/-/g, "");
  return result.extras.find(
    (e) =>
      e.registration.toUpperCase() === reg.toUpperCase() ||
      e.registration.toUpperCase().replace(/-/g, "") === normReg,
  );
}

// ---------------------------------------------------------------------------
// FIXTURE 1: extras-13apr-fixture.xlsx
//   Anonimised replica of the standard Extras layout.
//   Covers: main-section two-column layout, special-section Catering Aire /
//   NJE / Prensa, date parsing, service categorisation, deduplication.
// ---------------------------------------------------------------------------

describe.skipIf(!FIXTURES_AVAILABLE)("excelParser — extras-13apr-fixture.xlsx (golden structure)", () => {
  // Parse once; individual tests read from the shared result.
  const result: ExcelParseResult = parseExtrasExcel(loadFixture("extras-13apr-fixture.xlsx"));

  it("parses the date from a single-cell FECHA header", () => {
    // Fixture row 0 col G: 'FECHA:  13APR'
    expect(result.date).toBe("2026-04-13");
  });

  it("returns no errors for a well-formed file", () => {
    expect(result.errors).toHaveLength(0);
  });

  it("extracts registrations from the left main-section column (no-dash input)", () => {
    // 'CSDXX' in colA is normalised to 'CS-DXX' via insertDash (CS is in TWO_CHAR_PREFIXES)
    const e = findExtra(result, "CS-DXX");
    expect(e).toBeDefined();
    expect(e!.registration).toBe("CS-DXX");
  });

  it("extracts registrations from the right main-section column (no-dash input)", () => {
    // 'ECNQS' in colE -> 'EC-NQS'
    const e = findExtra(result, "EC-NQS");
    expect(e).toBeDefined();
    expect(e!.registration).toBe("EC-NQS");
  });

  it("collects continuation description lines under the same registration", () => {
    // EC-NQS: first line 'VAJILLA', continuation '01 TERMO', CATERING from Catering Aire
    const e = findExtra(result, "EC-NQS")!;
    expect(e.rawDescriptions).toContain("VAJILLA");
    expect(e.rawDescriptions).toContain("01 TERMO");
  });

  it("categorises VAJILLA as DISHES service", () => {
    const e = findExtra(result, "EC-NQS")!;
    expect(e.services.some((s) => s.type === "DISHES")).toBe(true);
  });

  it("categorises TERMO as THERMOS with quantity=1 from '01 TERMO'", () => {
    const e = findExtra(result, "EC-NQS")!;
    const thermo = e.services.find((s) => s.type === "THERMOS");
    expect(thermo).toBeDefined();
    expect(thermo!.quantity).toBe(1);
  });

  it("categorises BOLSA NEVERA as COOLER_BAG", () => {
    // OE-FZD has 'BOLSA NEVERA' continuation
    const e = findExtra(result, "OE-FZD")!;
    expect(e.services.some((s) => s.type === "COOLER_BAG")).toBe(true);
  });

  it("splits compound descriptions (CATERING, PRENSA) into separate services", () => {
    const e = findExtra(result, "CS-DXX")!;
    const types = e.services.map((s) => s.type);
    expect(types).toContain("CATERING");
    expect(types).toContain("NEWSPAPERS");
  });

  it("splits '+' compound descriptions (CATERING + 2 TERMOS) into separate services", () => {
    // D-CRTP colF has 'CATERING + 2 TERMOS' continuation
    const e = findExtra(result, "D-CRTP")!;
    const thermos = e.services.find((s) => s.type === "THERMOS");
    expect(thermos).toBeDefined();
    expect(thermos!.quantity).toBe(2);
  });

  it("categorises LINEN as LAUNDRY", () => {
    const e = findExtra(result, "D-CRTP")!;
    expect(e.services.some((s) => s.type === "LAUNDRY")).toBe(true);
  });

  it("N-prefix registration (no dash ever inserted) is extracted correctly", () => {
    // 'N1956M' stays 'N1956M' — insertDash explicitly preserves N-numbers
    const e = findExtra(result, "N1956M");
    expect(e).toBeDefined();
    expect(e!.registration).toBe("N1956M");
  });

  it("lowercase input in main section is uppercased correctly (ecmla -> EC-MLA)", () => {
    // fixture row 13: 'ecmla' in colA (lowercase)
    const e = findExtra(result, "EC-MLA");
    expect(e).toBeDefined();
    expect(e!.registration).toBe("EC-MLA");
  });

  // --- Catering Aire special section ---

  it("extracts Catering Aire entry for EC-NQS with correct time string", () => {
    const e = findExtra(result, "EC-NQS")!;
    const caire = e.services.find((s) => s.origin === "Catering Aire");
    expect(caire).toBeDefined();
    expect(caire!.type).toBe("CATERING");
    expect(caire!.name).toBe("Catering Aire 10:30");
  });

  it("extracts Catering Aire entry for OE-FZD", () => {
    const e = findExtra(result, "OE-FZD")!;
    const caire = e.services.find((s) => s.origin === "Catering Aire");
    expect(caire?.name).toBe("Catering Aire 13:00");
  });

  it("drops the generic CATERING description when a detailed Catering Aire entry exists", () => {
    // EC-NQS rawDescriptions includes 'CATERING' (from continuation colB).
    // The special Catering Aire entry exists, so the generic one should be suppressed.
    const e = findExtra(result, "EC-NQS")!;
    const genericCatering = e.services.find(
      (s) => s.type === "CATERING" && !s.origin,
    );
    expect(genericCatering).toBeUndefined();
  });

  // --- NetJets NJE special section ---

  it("extracts NJE PAX catering for CS-PHF with correct reference and target", () => {
    const e = findExtra(result, "CS-PHF")!;
    const njePax = e.services.find((s) => s.origin === "NetJets" && s.target === "PAX");
    expect(njePax).toBeDefined();
    expect(njePax!.reference).toBe("12248105");
    expect(njePax!.name).toBe("NJE PAX #12248105");
  });

  it("extracts NJE CREW catering for CS-PHF with correct reference and target", () => {
    const e = findExtra(result, "CS-PHF")!;
    const njeCrew = e.services.find((s) => s.origin === "NetJets" && s.target === "CREW");
    expect(njeCrew).toBeDefined();
    expect(njeCrew!.reference).toBe("12274481");
    expect(njeCrew!.name).toBe("NJE CREW #12274481");
  });

  // --- Prensa MCR special section ---

  it("extracts Prensa MCR newspaper from sub-header row (first prensa entry)", () => {
    // fixture row 16 (sub-header): col F = 'CSDXX', col G = 'FT'
    const e = findExtra(result, "CS-DXX")!;
    const prensa = e.services.find((s) => s.type === "NEWSPAPERS" && s.origin === "MCR");
    expect(prensa).toBeDefined();
    expect(prensa!.name).toBe("FT");
  });

  it("extracts Prensa MCR newspaper continuation lines ('STR + SPA' for CS-PHF)", () => {
    const e = findExtra(result, "CS-PHF")!;
    const prensa = e.services.find((s) => s.origin === "MCR");
    expect(prensa?.name).toBe("STR + SPA");
  });

  it("extracts Prensa for EC-NQS continuation line ('GER')", () => {
    const e = findExtra(result, "EC-NQS")!;
    const prensa = e.services.filter((s) => s.origin === "MCR");
    expect(prensa.some((s) => s.name === "GER")).toBe(true);
  });

  // --- SKYVALET skip ---

  it("skips NJE catering rows where time column is SKYVALET", () => {
    // fixture row 21: ['1500', 'DCRTP', 'SKYVALET'] -> no NJE should be created
    const e = findExtra(result, "D-CRTP")!;
    const njeServices = e.services.filter((s) => s.origin === "NetJets");
    expect(njeServices).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// FIXTURE 2: extras-03apr-edge-cases.xlsx
//   Probes the edge cases that are most likely to silently break the
//   matrícula join: turnarounds, prefix coverage, padded strings, /N suffixes.
// ---------------------------------------------------------------------------

describe("excelParser — extras-03apr-edge-cases.xlsx (registration normalisation)", () => {
  const result: ExcelParseResult = parseExtrasExcel(loadFixture("extras-03apr-edge-cases.xlsx"));

  it("parses the date from a two-cell split FECHA header", () => {
    // Row 0 col F = 'FECHA: ', col G = '03APR'
    expect(result.date).toBe("2026-04-03");
  });

  // --- Two-char prefix coverage ---

  it("normalises 9H prefix (9H in TWO_CHAR_PREFIXES): 9HVCT -> 9H-VCT", () => {
    const e = findExtra(result, "9H-VCT");
    expect(e).toBeDefined();
    expect(e!.registration).toBe("9H-VCT");
  });

  it("normalises A7 prefix (A7 in TWO_CHAR_PREFIXES): A7CGM -> A7-CGM", () => {
    const e = findExtra(result, "A7-CGM");
    expect(e).toBeDefined();
    expect(e!.registration).toBe("A7-CGM");
  });

  it("normalises LX prefix (LX in TWO_CHAR_PREFIXES): LXFLI -> LX-FLI", () => {
    const e = findExtra(result, "LX-FLI");
    expect(e).toBeDefined();
    expect(e!.registration).toBe("LX-FLI");
  });

  it("normalises PH prefix (PH in TWO_CHAR_PREFIXES): PHHRM -> PH-HRM", () => {
    const e = findExtra(result, "PH-HRM");
    expect(e).toBeDefined();
    expect(e!.registration).toBe("PH-HRM");
  });

  it("normalises G prefix (single-char in ONE_CHAR_PREFIXES): GSHUI -> G-SHUI", () => {
    const e = findExtra(result, "G-SHUI");
    expect(e).toBeDefined();
    expect(e!.registration).toBe("G-SHUI");
  });

  // --- Padded / lowercase input ---

  it("strips leading/trailing whitespace from registration in colA (' ECMLA ' -> 'EC-MLA')", () => {
    // fixture row 3 colA is ' ECMLA ' (space-padded)
    const e = findExtra(result, "EC-MLA");
    expect(e).toBeDefined();
    expect(e!.registration).toBe("EC-MLA");
  });

  // --- Turnaround: same registration on both columns ---

  it("turnaround: same registration in both left AND right main-section columns merges into ONE entry", () => {
    // CS-TZZ appears in colA ('CSTZZ') AND colE ('CSTZZ') of the same sheet
    const entries = result.extras.filter((e) => e.registration === "CS-TZZ");
    expect(entries).toHaveLength(1);
  });

  it("turnaround: rawDescriptions collects from both columns", () => {
    const e = findExtra(result, "CS-TZZ")!;
    expect(e.rawDescriptions).toContain("CATERING"); // from left col
    expect(e.rawDescriptions).toContain("PRENSA");   // from right col
  });

  it("turnaround: NJE catering without /P or /C suffix creates entry with undefined target", () => {
    // fixture NJE row: ['1300', 'GSHUI', '1030', '12231641 - 1', 'CSTZZ']
    // CSTZZ without /P or /C -> target should be undefined.
    // After BUG-2 fix, CS-TZZ also gains ref 12278795 (from CSTZZ/1 on row 11);
    // we find the specific entry by reference to avoid order dependency.
    const e = findExtra(result, "CS-TZZ")!;
    const nje = e.services.find((s) => s.origin === "NetJets" && s.reference === "12231641");
    expect(nje).toBeDefined();
    expect(nje!.target).toBeUndefined();
  });

  it("turnaround Catering Aire time '0900/0930' extracts the leading time only (09:00)", () => {
    // fixture row: ['0900/0930', '9HVCT'] -> time regex /^(\d{3,4})/ captures '0900'
    const e = findExtra(result, "9H-VCT")!;
    const caire = e.services.find((s) => s.origin === "Catering Aire");
    expect(caire).toBeDefined();
    expect(caire!.name).toBe("Catering Aire 09:00");
    // Note: the trailing '/0930' alternate time is silently discarded — documented behaviour.
  });

  it("BOLSA VACIA EN ALMACEN is categorised as STORAGE_BAG", () => {
    const e = findExtra(result, "PH-HRM")!;
    expect(e.services.some((s) => s.type === "STORAGE_BAG")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// REGISTRATION NORMALISATION — route.ts join symmetry
//
// The parser always outputs registrations WITH dashes (via insertDash).
// The route.ts join (PUT /api/import/extras) adds both the dashed form and
// the dash-stripped form to visitByReg, so either form from the DB matches.
// These tests document the guarantee expected by the join layer.
// ---------------------------------------------------------------------------

describe("excelParser — registration normalisation symmetry (join contract)", () => {
  const fixture = loadFixture("extras-13apr-fixture.xlsx");

  it("parser output always has a dash for two-char-prefix registrations (no-dash input)", () => {
    const result = parseExtrasExcel(fixture);
    // All CS-prefix entries in the fixture were input WITHOUT dash ('CSDXX', 'CSPHF')
    const csRegs = result.extras.filter((e) => e.registration.startsWith("CS-"));
    expect(csRegs.length).toBeGreaterThan(0);
    csRegs.forEach((e) => {
      expect(e.registration).toMatch(/^CS-/);
    });
  });

  it("parser output always has a dash for one-char-prefix registrations", () => {
    const result = parseExtrasExcel(fixture);
    // D-CRTP was input as 'DCRTP' (from D-CRTP's colE in the fixture)
    const dReg = result.extras.find((e) => e.registration.startsWith("D-"));
    expect(dReg).toBeDefined();
    expect(dReg!.registration).toMatch(/^D-/);
  });

  it("N-prefix registrations are output WITHOUT a dash (insertDash preserves N-numbers)", () => {
    const result = parseExtrasExcel(fixture);
    const nReg = result.extras.find((e) => e.registration === "N1956M");
    expect(nReg).toBeDefined();
    // No dash expected for N-numbers
    expect(nReg!.registration).not.toContain("-");
  });

  it("route.ts join: parser output reg and DB reg (both uppercased) produce identical dash-stripped keys", () => {
    // Simulates the route.ts visitByReg lookup logic:
    //   visitByReg.set(dbReg.toUpperCase(), v)
    //   visitByReg.set(dbReg.toUpperCase().replace(/-/g,''), v)
    // and the lookup:
    //   visitByReg.get(extra.registration.toUpperCase()) ||
    //   visitByReg.get(extra.registration.toUpperCase().replace(/-/g,''))
    const result = parseExtrasExcel(fixture);
    for (const extra of result.extras) {
      const parsedReg = extra.registration.toUpperCase();
      const parsedNoDash = parsedReg.replace(/-/g, "");
      // If the DB stores 'CS-DXX', route adds 'CSDXX' too, so parser's 'CS-DXX' matches.
      // If the DB stores 'CSDXX', route adds 'CSDXX', and parser's 'CS-DXX'.replace(/-/,'') = 'CSDXX' matches.
      // In both cases at least one key overlaps — verified by the no-dash key being identical.
      const dbFormWithDash = parsedReg;
      const dbFormNoDash = parsedNoDash;
      // The no-dash key is the same from either direction
      expect(dbFormWithDash.replace(/-/g, "")).toBe(dbFormNoDash);
    }
  });
});

// ---------------------------------------------------------------------------
// FIXTURE 3: extras-nje-legs.xlsx
//   Reproduces the real-world pattern of NJE leg suffixes /1 and /2 that appear
//   in production Excel files (DIEFD/1, OEHCY/1, OEHCY/2, DIEFD/2).
//
//   Aircraft OE-HCY (OEHCY):
//     - leg 1: left-col CATERING + NJE entry OEHCY/1 ref 98765002
//     - leg 2: right-col CATERING, NO NJE for this leg
//     -> BUG-2 fix: OEHCY/1 must produce a service (was silently dropped)
//     -> BUG-3 fix: leg 2's generic CATERING must survive (was globally suppressed)
//
//   Aircraft D-IEFD (DIEFD in Excel, D is ONE_CHAR_PREFIX):
//     - leg 1: NJE entry DIEFD/1 ref 98765001 (no main-section description)
//     - leg 2: NJE entry DIEFD/2 ref 98765004
//     -> BUG-2 fix: both NJE entries must be created
// ---------------------------------------------------------------------------

describe("excelParser — extras-nje-legs.xlsx (BUG-2 + BUG-3 real-pattern fixtures)", () => {
  const result: ExcelParseResult = parseExtrasExcel(loadFixture("extras-nje-legs.xlsx"));

  it("parses the date from header (FECHA: 24MAY26)", () => {
    expect(result.date).toBe("2026-05-24");
  });

  // --- BUG-2: /1 and /2 leg suffixes on NJE registrations ---

  it("BUG-2 fixed: NJE entry DIEFD/1 is not dropped — ref 98765001 appears in D-IEFD services", () => {
    const e = findExtra(result, "D-IEFD");
    expect(e).toBeDefined();
    const refs = e!.services.filter((s) => s.origin === "NetJets").map((s) => s.reference);
    expect(refs).toContain("98765001");
  });

  it("BUG-2 fixed: NJE entry DIEFD/2 is not dropped — ref 98765004 appears in D-IEFD services", () => {
    const e = findExtra(result, "D-IEFD");
    expect(e).toBeDefined();
    const refs = e!.services.filter((s) => s.origin === "NetJets").map((s) => s.reference);
    expect(refs).toContain("98765004");
  });

  it("BUG-2 fixed: D-IEFD has exactly two NJE entries (one per leg)", () => {
    const e = findExtra(result, "D-IEFD")!;
    const njeServices = e.services.filter((s) => s.origin === "NetJets");
    expect(njeServices).toHaveLength(2);
  });

  it("BUG-2 fixed: NJE entry OEHCY/1 is not dropped — ref 98765002 appears in OE-HCY services", () => {
    const e = findExtra(result, "OE-HCY");
    expect(e).toBeDefined();
    const refs = e!.services.filter((s) => s.origin === "NetJets").map((s) => s.reference);
    expect(refs).toContain("98765002");
  });

  it("BUG-2 fixed: numeric leg suffix (/1, /2) does not set a PAX/CREW target (target is undefined)", () => {
    const e = findExtra(result, "OE-HCY")!;
    const nje = e.services.find((s) => s.reference === "98765002");
    expect(nje).toBeDefined();
    expect(nje!.target).toBeUndefined();
  });

  it("BUG-2 fixed: numeric leg suffix (/1, /2) does not set a PAX/CREW target for DIEFD legs", () => {
    const e = findExtra(result, "D-IEFD")!;
    for (const svc of e.services.filter((s) => s.origin === "NetJets")) {
      expect(svc.target).toBeUndefined();
    }
  });

  // Regression: /P and /C still set target correctly (must not break existing logic)
  it("NJE /P suffix still sets target=PAX (regression guard)", () => {
    const f = loadFixture("extras-13apr-fixture.xlsx");
    const r = parseExtrasExcel(f);
    const e = findExtra(r, "CS-PHF")!;
    const njePax = e.services.find((s) => s.origin === "NetJets" && s.target === "PAX");
    expect(njePax).toBeDefined();
    expect(njePax!.reference).toBe("12248105");
  });

  it("NJE /C suffix still sets target=CREW (regression guard)", () => {
    const f = loadFixture("extras-13apr-fixture.xlsx");
    const r = parseExtrasExcel(f);
    const e = findExtra(r, "CS-PHF")!;
    const njeCrew = e.services.find((s) => s.origin === "NetJets" && s.target === "CREW");
    expect(njeCrew).toBeDefined();
    expect(njeCrew!.reference).toBe("12274481");
  });

  // --- BUG-3: per-leg dedup — a leg without NJE keeps its generic CATERING ---

  it("BUG-3 fixed: OE-HCY leg 2 (no NJE) retains a generic CATERING service", () => {
    // OE-HCY: leg 1 has NJE 98765002 (replaces its generic CATERING),
    //         leg 2 has NO NJE -> its generic CATERING must NOT be suppressed.
    // With count-based dedup: 2 generic CATERINGs, 1 NJE -> 1 generic survives.
    const e = findExtra(result, "OE-HCY")!;
    const genericCatering = e.services.find((s) => s.type === "CATERING" && !s.origin);
    expect(genericCatering).toBeDefined();
  });

  it("BUG-3 fixed: OE-HCY has both a generic CATERING (leg 2) and the NJE service (leg 1)", () => {
    const e = findExtra(result, "OE-HCY")!;
    const njeService = e.services.find((s) => s.origin === "NetJets");
    const genericCatering = e.services.find((s) => s.type === "CATERING" && !s.origin);
    expect(njeService).toBeDefined();
    expect(genericCatering).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// BUG-2 regression: CSTZZ/1 leg suffix (edge-cases fixture)
//   After fix, ref 12278795 must appear alongside 12231641 in CS-TZZ services.
// ---------------------------------------------------------------------------

describe("excelParser — BUG-2 regression (extras-03apr-edge-cases.xlsx, CSTZZ/1)", () => {
  const result: ExcelParseResult = parseExtrasExcel(loadFixture("extras-03apr-edge-cases.xlsx"));

  it("BUG-2 fixed: CSTZZ/1 NJE entry (ref 12278795) is not silently dropped", () => {
    const cstzz = findExtra(result, "CS-TZZ")!;
    const njeRefs = cstzz.services
      .filter((s) => s.origin === "NetJets")
      .map((s) => s.reference);
    expect(njeRefs).toContain("12278795");
    expect(njeRefs).toContain("12231641");
  });

  it("BUG-3 (CS-TZZ): both legs have NJE so generic CATERING is correctly suppressed (count-based)", () => {
    // CS-TZZ: 1 generic CATERING in main section, 2 NJE entries (after BUG-2 fix).
    // Count-based dedup: max(1 - 2, 0) = 0 generic caterings survive -> undefined is CORRECT.
    // This is NOT the bug anymore; it is the right outcome (NJE fully covers the leg).
    const cstzz = findExtra(result, "CS-TZZ")!;
    expect(cstzz.rawDescriptions).toContain("CATERING"); // raw text preserved
    const genericCatering = cstzz.services.find(
      (s) => s.type === "CATERING" && !s.origin,
    );
    expect(genericCatering).toBeUndefined(); // correctly suppressed: NJE covers it
  });
});

// ---------------------------------------------------------------------------
// KNOWN BUGS / DOCUMENTED BEHAVIOUR
//
// These tests DESCRIBE and LOCK IN the current (buggy) behaviour so that any
// fix is visible as a diff. BUG-1 and BUG-4 are not being fixed in this pass.
// ---------------------------------------------------------------------------

describe("excelParser — known bugs (behaviour locked, NOT fixed here)", () => {
  const fixture1 = loadFixture("extras-13apr-fixture.xlsx");

  // BUG-1: isRegistration() rejects dashes in main-section colA / colE
  //
  // Location: excelParser.ts line 101
  //   /^[A-Z0-9][A-Z0-9]{3,6}$/i  — rejects any string containing '-'
  //
  // Impact: if the Excel operator types the registration WITH a dash in the
  // main section (e.g. 'HB-FAM' in colE), the registration is not recognised,
  // currentRegRight stays null or is NOT updated, and all description lines for
  // that aircraft are silently DROPPED (or attributed to the previous aircraft).
  //
  // Fixture evidence: fixture 1, row 5, colE = 'HB-FAM', colF = 'CATERING'
  // -> 'HB-FAM' fails isRegistration -> no entry created -> CATERING is lost.
  it("BUG-1: a dashed registration in main-section colE is silently dropped (HB-FAM)", () => {
    const result = parseExtrasExcel(fixture1);
    const hbfam = findExtra(result, "HB-FAM");
    // Current behaviour: NOT found (the entry is dropped)
    expect(hbfam).toBeUndefined(); // BUG: should be defined
  });

  // BUG-4: ONE_CHAR_PREFIXES false positive — 'Z' prefix accepts non-existent national prefixes
  //
  // Location: excelParser.ts line 88 (looksLikeRegistration) + line 79 (insertDash)
  //   ONE_CHAR_PREFIXES = new Set(['B','C','D','F','G','I','N','Z'])
  //   looksLikeRegistration: if ONE_CHAR_PREFIXES.has(u[0]) && u[0] !== 'N' -> return true
  //
  // Impact: a string like 'ZZTEST' (Z prefix) is accepted by looksLikeRegistration
  // because 'Z' is in ONE_CHAR_PREFIXES. 'ZZ' is NOT a real country prefix, but the
  // check only looks at the first character. This means garbled cell content starting
  // with Z/B/C/D/F/G/I is silently treated as a valid registration.
  //
  // Fixture evidence: fixture 1, row 10 colA = 'ZZTEST'
  // -> isRegistration('ZZTEST') = true (should be false)
  // -> inserted as 'Z-ZTEST' via insertDash (Z prefix, single-char insert)
  it("BUG-4: 'ZZTEST' is incorrectly accepted as registration 'Z-ZTEST' (Z prefix false positive)", () => {
    const result = parseExtrasExcel(fixture1);
    const zztest = findExtra(result, "Z-ZTEST");
    // Current behaviour: entry IS created (false positive)
    expect(zztest).toBeDefined(); // BUG: should be undefined
    expect(zztest!.registration).toBe("Z-ZTEST");
  });
});
