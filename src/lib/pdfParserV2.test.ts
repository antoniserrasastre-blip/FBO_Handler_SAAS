/**
 * pdfParserV2.test.ts
 *
 * Golden tests for parsePageItems (pure logic, no PDF I/O).
 *
 * Fixture: src/lib/__fixtures__/cybermax-13apr.items.json
 *   Derived from a real Cybermax 13-APR daily sheet.
 *   Callsigns and tail-number registrations have been replaced with fictional
 *   equivalents of the SAME LENGTH (to preserve column-alignment behaviour).
 *   Airport codes, parking stand numbers, aircraft types and crew/pax counts
 *   are unchanged — they contain no PII.
 *   X/Y coordinates are 1:1 from pdfjs-dist extraction.
 *
 * Test categories
 *   1. Golden output  — full ParseResult from the fixture
 *   2. Column-boundary edge cases — synthetic mini-items that probe findColumn
 *      (these are the fragility tests: wrong X → wrong field, silently)
 *
 * TZ note: parsePageItems is purely structural; it does NOT interpret times as
 * UTC or local — it just stores the strings. TZ conversion happens upstream.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parsePageItems, PdfItem, type ParseWarning } from './pdfParserV2';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// The golden fixture is anonymised but kept local-only (gitignored, see
// .gitignore: src/lib/__fixtures__/cybermax-*.json). Load it at runtime instead
// of `import`ing it so `tsc --noEmit` / CI don't require the file; the golden
// blocks below skip when it's absent. Synthetic column-boundary tests still run.
const FIXTURE_PATH = path.resolve(__dirname, '__fixtures__', 'cybermax-13apr.items.json');
const FIXTURE_AVAILABLE = existsSync(FIXTURE_PATH);
const fixtureData: { pages: PdfItem[][] } = FIXTURE_AVAILABLE
  ? JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8'))
  : { pages: [[]] };

/** Items for page 0 of the fixture */
const fixturePage0 = fixtureData.pages[0] as PdfItem[];

// ---------------------------------------------------------------------------
// 1. Golden output — full ParseResult from the fixture
// ---------------------------------------------------------------------------

describe.skipIf(!FIXTURE_AVAILABLE)('parsePageItems — golden output (cybermax-13apr fixture)', () => {
  const result = parsePageItems(fixturePage0, /* isFirstPage */ true);

  it('extracts sheetDate from the header date row', () => {
    expect(result.sheetDate).toBe('13/04/26');
  });

  it('returns exactly 5 flights (rows selected for fixture)', () => {
    expect(result.flights).toHaveLength(5);
  });

  describe('flight[0] — TXF99A: full turnaround, same-day arrival + departure', () => {
    const f = result.flights[0];

    it('arrival callsign', ()   => expect(f.callsign).toBe('TXF99A'));
    it('origin ICAO',    ()     => expect(f.origin).toBe('EDMA'));
    it('prevDate',       ()     => expect(f.prevDate).toBe('02/04/26'));
    it('arrTime (Zulu)', ()     => expect(f.arrTime).toBe('17:25'));
    it('registration',   ()     => expect(f.registration).toBe('D-FAKE'));
    it('aircraft type',  ()     => expect(f.aircraft).toBe('CL30'));
    it('parking stand',  ()     => expect(f.parking).toBe('210'));
    it('crewArr count',  ()     => expect(f.crewArr).toBe('2'));
    it('crewDep count',  ()     => expect(f.crewDep).toBe('2'));
    it('paxArr count',   ()     => expect(f.paxArr).toBe('1'));
    it('paxDep count',   ()     => expect(f.paxDep).toBe('2'));
    it('dep callsign',   ()     => expect(f.depCallsign).toBe('TXF99A'));
    it('destination',    ()     => expect(f.destination).toBe('EDMA'));
    it('depDate',        ()     => expect(f.depDate).toBe('13/04/26'));
    it('depTime (Zulu)', ()     => expect(f.depTime).toBe('05:30'));
    it('flightType = HANDLING', () => expect(f.flightType).toBe('HANDLING'));
  });

  describe('flight[1] — GKR22B: turnaround, prev_date on second sub-row', () => {
    const f = result.flights[1];

    it('arrival callsign',  () => expect(f.callsign).toBe('GKR22B'));
    it('origin ICAO',       () => expect(f.origin).toBe('LPFR'));
    it('registration',      () => expect(f.registration).toBe('OE-TST'));
    it('aircraft type',     () => expect(f.aircraft).toBe('PC24'));
    it('crewArr count',     () => expect(f.crewArr).toBe('2'));
    it('crewDep count',     () => expect(f.crewDep).toBe('2'));
    it('paxArr count',      () => expect(f.paxArr).toBe('0'));
    it('paxDep count',      () => expect(f.paxDep).toBe('2'));
    it('prevDate from sub-row', () => expect(f.prevDate).toBe('13/04/26'));
    it('arrTime from sub-row',  () => expect(f.arrTime).toBe('08:40'));
    it('dep callsign',      () => expect(f.depCallsign).toBe('GKR22B'));
    it('destination',       () => expect(f.destination).toBe('EGGW'));
    it('depDate',           () => expect(f.depDate).toBe('13/04/26'));
    it('depTime',           () => expect(f.depTime).toBe('09:55'));
    it('parking absent',    () => expect(f.parking).toBe(''));
    it('flightType = HANDLING', () => expect(f.flightType).toBe('HANDLING'));
  });

  describe('flight[2] — TST385T: incomplete dep_callsign ("TST" only), missing crewDep + paxDep', () => {
    const f = result.flights[2];

    it('arrival callsign', ()  => expect(f.callsign).toBe('TST385T'));
    it('origin',           ()  => expect(f.origin).toBe('EHRD'));
    it('registration',     ()  => expect(f.registration).toBe('CS-TST'));
    it('crewArr',          ()  => expect(f.crewArr).toBe('2'));
    it('crewDep is empty because its item is absent in PDF', () =>
      expect(f.crewDep).toBe(''));
    it('paxArr',           ()  => expect(f.paxArr).toBe('3'));
    it('paxDep is empty because its item is absent in PDF', () =>
      expect(f.paxDep).toBe(''));
    it('dep callsign is partial "TST"', () =>
      expect(f.depCallsign).toBe('TST'));
    it('destination is empty (no item in PDF)', () =>
      expect(f.destination).toBe(''));
    it('depDate is empty', () => expect(f.depDate).toBe(''));
    it('depTime is empty', () => expect(f.depTime).toBe(''));
    it('flightType = HANDLING', () => expect(f.flightType).toBe('HANDLING'));
  });

  describe('flight[3] — MXQ85H: long-stay pernocta (arr 13/04, dep 17/04)', () => {
    const f = result.flights[3];

    it('arrival callsign',  () => expect(f.callsign).toBe('MXQ85H'));
    it('origin',            () => expect(f.origin).toBe('LSGG'));
    it('registration',      () => expect(f.registration).toBe('SP-TST'));
    it('arrTime',           () => expect(f.arrTime).toBe('15:25'));
    it('crewArr',           () => expect(f.crewArr).toBe('2'));
    it('crewDep',           () => expect(f.crewDep).toBe('2'));
    it('paxArr',            () => expect(f.paxArr).toBe('4'));
    it('paxDep',            () => expect(f.paxDep).toBe('1'));
    it('depDate is future 17/04/26 — pernocta', () =>
      expect(f.depDate).toBe('17/04/26'));
    it('depTime',           () => expect(f.depTime).toBe('15:30'));
    it('dep callsign',      () => expect(f.depCallsign).toBe('MXQ85H'));
    it('destination',       () => expect(f.destination).toBe('EPWA'));
    it('flightType = HANDLING', () => expect(f.flightType).toBe('HANDLING'));
  });

  describe('flight[4] — FKV773: overnight stay (arr 13/04, dep 14/04)', () => {
    const f = result.flights[4];

    it('arrival callsign',  () => expect(f.callsign).toBe('FKV773'));
    it('origin',            () => expect(f.origin).toBe('EGGW'));
    it('registration',      () => expect(f.registration).toBe('9H-TST'));
    it('crewArr',           () => expect(f.crewArr).toBe('3'));
    it('crewDep',           () => expect(f.crewDep).toBe('3'));
    it('paxArr',            () => expect(f.paxArr).toBe('0'));
    it('paxDep',            () => expect(f.paxDep).toBe('2'));
    it('depDate is next day 14/04/26 — overnight', () =>
      expect(f.depDate).toBe('14/04/26'));
    it('depTime',           () => expect(f.depTime).toBe('07:30'));
    it('dep callsign',      () => expect(f.depCallsign).toBe('FKV773'));
    it('destination',       () => expect(f.destination).toBe('LFPB'));
    it('flightType = HANDLING', () => expect(f.flightType).toBe('HANDLING'));
  });
});

// ---------------------------------------------------------------------------
// 2. detectFlightType classification
// ---------------------------------------------------------------------------

describe('parsePageItems — flightType classification via detectFlightType', () => {
  function oneFlightItems(callsign: string, registration: string): PdfItem[] {
    const y = 700;
    return [
      { text: callsign,     x: 20.25,  y, page: 0 },
      { text: 'EDMA',       x: 71.25,  y, page: 0 },
      { text: registration, x: 189.32, y, page: 0 },
    ];
  }

  it('CAT prefix → EXTERNAL_SERVICE', () => {
    const { flights } = parsePageItems(oneFlightItems('CAT12X', 'G-FAKE'), false);
    expect(flights[0]?.flightType).toBe('EXTERNAL_SERVICE');
  });

  it('normal callsign → HANDLING', () => {
    const { flights } = parsePageItems(oneFlightItems('TXF99A', 'D-FAKE'), false);
    expect(flights[0]?.flightType).toBe('HANDLING');
  });

  it('ZJONES callsign → LOUNGE_GUEST', () => {
    const { flights } = parsePageItems(oneFlightItems('ZJONES', 'G-TEST'), false);
    expect(flights[0]?.flightType).toBe('LOUNGE_GUEST');
  });

  it('registration containing JONES → LOUNGE_GUEST', () => {
    const { flights } = parsePageItems(oneFlightItems('XYZ123', 'Z-JONES'), false);
    expect(flights[0]?.flightType).toBe('LOUNGE_GUEST');
  });
});

// ---------------------------------------------------------------------------
// 3. Column-boundary fragility tests
// ---------------------------------------------------------------------------

describe('parsePageItems — column-boundary edge cases (fragility documentation)', () => {
  /**
   * Builds a minimal one-flight item array around a single test item.
   * The callsign anchor at x=20.25 makes parsePageItems see a data row.
   */
  function itemsWithExtra(extra: PdfItem): PdfItem[] {
    return [
      { text: 'TST001', x: 20.25,  y: 700, page: 0 },  // arr_callsign anchor
      { text: 'EDMA',   x: 71.25,  y: 700, page: 0 },  // origin
      { text: 'D-FAKE', x: 189.32, y: 700, page: 0 },  // registration
      extra,
    ];
  }

  it('crew_arr: item at x=355.74 (real PDF value) is captured', () => {
    const { flights } = parsePageItems(
      itemsWithExtra({ text: '3', x: 355.74, y: 700, page: 0 }),
      false
    );
    expect(flights[0]?.crewArr).toBe('3');
  });

  it('crew_arr boundary: item at x=357 is still within crew_arr range [347,357]', () => {
    const { flights } = parsePageItems(
      itemsWithExtra({ text: '3', x: 357, y: 700, page: 0 }),
      false
    );
    // crew_arr: x=352, cx-5=347, cx+width=357  → 357 <= 357 → IN RANGE
    expect(flights[0]?.crewArr).toBe('3');
  });

  it('crew_arr boundary: item at x=358 falls into crew_sep (not crew_arr)', () => {
    const { flights } = parsePageItems(
      itemsWithExtra({ text: '3', x: 358, y: 700, page: 0 }),
      false
    );
    // crew_arr range [347,357] ends at 357; crew_sep range [358,364] starts at 358.
    // x=358 → crew_arr misses (358>357), crew_sep matches (358>=358) → discarded.
    expect(flights[0]?.crewArr).toBe('');
  });

  it('crew_dep: item at x=367.5 (real PDF value) is captured', () => {
    const { flights } = parsePageItems(
      itemsWithExtra({ text: '2', x: 367.5, y: 700, page: 0 }),
      false
    );
    expect(flights[0]?.crewDep).toBe('2');
  });

  it('crew_sep boundary: item at x=362 falls in crew_sep [358,364] — deterministic, not first-match', () => {
    // New explicit boundaries (no overlaps):
    //   crew_sep: [358, 364]  (midpoint of anchors 362 and 368 → 365; sep ends at 364)
    //   crew_dep: [365, 376]
    // x=362 is inside crew_sep → absorbed (no switch case), crewDep stays ''.
    // This is now deterministic: crew_sep wins because its explicit range [358,364] covers 362,
    // NOT because it happened to be first in definition order.
    // A digit drifted to x=365 would be the first value reaching crew_dep (see companion test).
    const { flights } = parsePageItems(
      itemsWithExtra({ text: '2', x: 362, y: 700, page: 0 }),
      false
    );
    expect(flights[0]?.crewDep).toBe('');  // in crew_sep zone — absorbed by separator
    expect(flights[0]?.crewArr).toBe('');  // not in crew_arr [347,357] either
  });

  it('crew_dep boundary: item at x=365 is first value reaching crew_dep [365,376]', () => {
    // New boundary: crew_dep starts at x=365 (left edge moved from old 363 → 365).
    // Any digit at x≥365 up to x=376 is now unambiguously crew_dep.
    const { flights } = parsePageItems(
      itemsWithExtra({ text: '2', x: 365, y: 700, page: 0 }),
      false
    );
    expect(flights[0]?.crewDep).toBe('2');
  });

  it('pax_arr: item at x=387.24 (real PDF value) is captured', () => {
    const { flights } = parsePageItems(
      itemsWithExtra({ text: '5', x: 387.24, y: 700, page: 0 }),
      false
    );
    expect(flights[0]?.paxArr).toBe('5');
  });

  it('pax_arr boundary: item at x=391 is still within pax_arr range [382,391]', () => {
    const { flights } = parsePageItems(
      itemsWithExtra({ text: '5', x: 391, y: 700, page: 0 }),
      false
    );
    expect(flights[0]?.paxArr).toBe('5');
  });

  it('pax_arr boundary: item at x=392 falls out of pax_arr and into pax_sep', () => {
    // pax_arr range [382,391]; pax_sep range [392,396]
    // x=392: pax_arr misses (392>391), pax_sep matches → discarded
    const { flights } = parsePageItems(
      itemsWithExtra({ text: '5', x: 392, y: 700, page: 0 }),
      false
    );
    expect(flights[0]?.paxArr).toBe('');
  });

  it('pax_dep: item at x=399 (real PDF value) is captured', () => {
    const { flights } = parsePageItems(
      itemsWithExtra({ text: '4', x: 399, y: 700, page: 0 }),
      false
    );
    expect(flights[0]?.paxDep).toBe('4');
  });

  it('parking/crew_arr boundary: item at x=350 now correctly maps to crew_arr [347,357]', () => {
    // Old behaviour (FIXED): parking range was [298,353], crew_arr was [347,357].
    // Overlap zone [347,353] — parking won first-match, crew count was silently lost.
    //
    // New explicit boundaries (no overlaps):
    //   parking:  [298, 346]  (right edge clipped to 346)
    //   crew_arr: [347, 357]  (unchanged)
    // x=350 is now outside parking (350 > 346) and inside crew_arr (350 ≥ 347).
    // If Cybermax shifts crew_arr left by up to 5 px (to ~350), it is still captured.
    const { flights } = parsePageItems(
      itemsWithExtra({ text: '2', x: 350, y: 700, page: 0 }),
      false
    );
    expect(flights[0]?.crewArr).toBe('2');   // correctly captured — no longer lost
    expect(flights[0]?.parking).toBe('');    // parking range ends at 346, x=350 is outside
  });

  it('pax_sep boundary: item at x=394 falls in pax_sep [392,396] — deterministic, not first-match', () => {
    // New explicit boundaries (no overlaps):
    //   pax_sep: [392, 396]  (midpoint of anchors 395 and 399 → 397; sep ends at 396)
    //   pax_dep: [397, 407]  (left edge moved from old 394 → 397)
    // x=394 is inside pax_sep [392,396] → absorbed (no switch case), paxDep stays ''.
    // This is deterministic: pax_sep wins because its explicit range covers 394.
    // Note: the real "/" in Cybermax PDFs appears at x≈394.72 — also in pax_sep ✓.
    // A pax_dep digit at x=397 is the first value reaching pax_dep (see companion test).
    const { flights } = parsePageItems(
      itemsWithExtra({ text: '3', x: 394, y: 700, page: 0 }),
      false
    );
    expect(flights[0]?.paxDep).toBe('');   // in pax_sep zone — absorbed by separator
    expect(flights[0]?.paxArr).toBe('');   // not in pax_arr [382,391] either
  });

  it('pax_dep boundary: item at x=397 is first value reaching pax_dep [397,407]', () => {
    // New boundary: pax_dep starts at x=397 (left edge moved from old 394 → 397).
    // Any digit at x≥397 up to x=407 is now unambiguously pax_dep.
    const { flights } = parsePageItems(
      itemsWithExtra({ text: '3', x: 397, y: 700, page: 0 }),
      false
    );
    expect(flights[0]?.paxDep).toBe('3');
  });

  it('separator columns still absorb "/" at real PDF positions (crew_sep x=361.72, pax_sep x=394.72)', () => {
    // Verifies constraint: "/" must never reach a data column (crewArr/crewDep/paxArr/paxDep).
    // crew_sep [357,364] captures "/" at x=361.72 → crewArr and crewDep stay ''.
    // pax_sep  [392,396] captures "/" at x=394.72 → paxArr and paxDep stay ''.
    // (sep columns have no case in the switch, so the text is silently discarded.)
    const items: PdfItem[] = [
      { text: 'TST001',   x: 20.25,  y: 700, page: 0 },   // arr_callsign anchor
      { text: 'EDMA',     x: 71.25,  y: 700, page: 0 },   // origin
      { text: 'D-FAKE',   x: 189.32, y: 700, page: 0 },   // registration
      { text: '/',        x: 361.72, y: 700, page: 0 },   // crew separator (real x from fixture)
      { text: '/',        x: 394.72, y: 700, page: 0 },   // pax separator (real x from fixture)
    ];
    const { flights } = parsePageItems(items, false);
    expect(flights[0]?.crewArr).toBe('');
    expect(flights[0]?.crewDep).toBe('');
    expect(flights[0]?.paxArr).toBe('');
    expect(flights[0]?.paxDep).toBe('');
  });

  it('dep_callsign: item at x=417.75 (real PDF value) is captured', () => {
    const { flights } = parsePageItems(
      itemsWithExtra({ text: 'FKV773', x: 417.75, y: 700, page: 0 }),
      false
    );
    expect(flights[0]?.depCallsign).toBe('FKV773');
  });

  it('star suffix stripped from dep_callsign (Cybermax asterisk notation)', () => {
    const items: PdfItem[] = [
      { text: 'FKV773',   x: 20.25,  y: 700, page: 0 },
      { text: 'EDMA',     x: 71.25,  y: 700, page: 0 },
      { text: 'D-FAKE',   x: 189.32, y: 700, page: 0 },
      { text: 'FKV773*',  x: 417.75, y: 700, page: 0 },
    ];
    const { flights } = parsePageItems(items, false);
    expect(flights[0]?.depCallsign).toBe('FKV773');
  });
});

// ---------------------------------------------------------------------------
// 4. Header rows are skipped (not parsed as flights)
// ---------------------------------------------------------------------------

describe('parsePageItems — header rows are filtered out', () => {
  it('does not produce flights from header items', () => {
    const headerItems: PdfItem[] = [
      { text: 'Vuelo',     x: 20.25, y: 758.55, page: 0 },
      { text: 'Origen',    x: 73.18, y: 758.4,  page: 0 },
      { text: 'LLEGADAS',  x: 73.08, y: 774.15, page: 0 },
      { text: 'SALIDAS',   x: 474.66, y: 774.15, page: 0 },
      // Company-name footer row. The name is now genericised via FBO_COMPANY_NAME
      // (defaults to 'FBO'); the filter must drop whatever that token resolves to.
      { text: 'FBO',       x: 20.25, y: 810.18, page: 0 },
    ];
    const { flights } = parsePageItems(headerItems, true);
    expect(flights).toHaveLength(0);
  });

  it('date string at x≈37 is filtered by the date-row guard', () => {
    const dateRowItems: PdfItem[] = [
      { text: '13/04/26',                     x: 36.93, y: 741.48, page: 0 },
      { text: '(lunes, 13 de abril de 2026)', x: 93.64, y: 741.48, page: 0 },
    ];
    const { flights } = parsePageItems(dateRowItems, true);
    expect(flights).toHaveLength(0);
  });

  it.skipIf(!FIXTURE_AVAILABLE)('sheetDate is not set on second page (isFirstPage=false)', () => {
    const { sheetDate } = parsePageItems(fixturePage0, /* isFirstPage */ false);
    expect(sheetDate).toBe('');
  });
});

// ---------------------------------------------------------------------------
// 5. Y-row merging (two sub-rows within ≤1 pt become one logical row)
// ---------------------------------------------------------------------------

describe('parsePageItems — Y-row merging', () => {
  it('items with Y differing by exactly 1 are merged into one flight', () => {
    const items: PdfItem[] = [
      // Main row y=700
      { text: 'FKV773', x: 20.25,  y: 700,   page: 0 },
      { text: 'EDMA',   x: 71.25,  y: 700,   page: 0 },
      { text: 'D-FAKE', x: 189.32, y: 700,   page: 0 },
      // Sub-row y=699.36 (typical Cybermax two-line layout, rounds to 699)
      { text: '13/04/26', x: 114.37, y: 699.36, page: 0 },
      { text: '08:40',    x: 155.74, y: 699.36, page: 0 },
    ];
    const { flights } = parsePageItems(items, false);
    expect(flights).toHaveLength(1);
    expect(flights[0].prevDate).toBe('13/04/26');
    expect(flights[0].arrTime).toBe('08:40');
  });

  it('items with Y differing by 2 become two separate flights (neither has prev_date)', () => {
    const items: PdfItem[] = [
      { text: 'FKV773', x: 20.25,  y: 700, page: 0 },
      { text: 'EDMA',   x: 71.25,  y: 700, page: 0 },
      { text: 'D-FAKE', x: 189.32, y: 700, page: 0 },
      // Sub-row 2 pts away — NOT merged
      { text: '13/04/26', x: 114.37, y: 698, page: 0 },
      { text: '08:40',    x: 155.74, y: 698, page: 0 },
    ];
    const { flights } = parsePageItems(items, false);
    // 698 row has no arr_callsign anchor → only 1 flight recognised
    // (the 698-row is silently dropped because it has no item at x∈[18,35])
    expect(flights).toHaveLength(1);
    expect(flights[0].prevDate).toBe('');
    expect(flights[0].arrTime).toBe('');
  });
});

// ---------------------------------------------------------------------------
// 6. Warning channel — ParseWarning[] populated and propagated correctly
// ---------------------------------------------------------------------------

describe('parsePageItems — warnings channel', () => {
  /**
   * Minimal one-flight item set.
   * callsign anchor at x=20.25 passes the data-row filter.
   * All standard fields present → clean row, no warnings expected.
   */
  function cleanFlightItems(): PdfItem[] {
    return [
      { text: 'TXF99A', x: 20.25,  y: 700, page: 0 },   // arr_callsign
      { text: 'EDMA',   x: 71.25,  y: 700, page: 0 },   // origin
      { text: 'D-FAKE', x: 189.32, y: 700, page: 0 },   // registration
      { text: 'CL30',   x: 240.10, y: 700, page: 0 },   // aircraft
      { text: '210',    x: 313.83, y: 700, page: 0 },   // parking
      { text: '2',      x: 355.74, y: 700, page: 0 },   // crew_arr
      { text: '/',      x: 361.72, y: 700, page: 0 },   // crew_sep (absorbed)
      { text: '2',      x: 367.5,  y: 700, page: 0 },   // crew_dep
      { text: '1',      x: 387.24, y: 700, page: 0 },   // pax_arr
      { text: '/',      x: 394.72, y: 700, page: 0 },   // pax_sep (absorbed)
      { text: '2',      x: 399,    y: 700, page: 0 },   // pax_dep
      { text: 'TXF99A', x: 417.75, y: 700, page: 0 },  // dep_callsign
      { text: 'EDMA',   x: 465.0,  y: 700, page: 0 },  // destination
      { text: '13/04/26', x: 507.0, y: 700, page: 0 }, // dep_date
      { text: '05:30',  x: 547.0,  y: 700, page: 0 },  // dep_time
    ];
  }

  // -- 6a. Clean row → zero warnings -----------------------------------------

  it('clean row with all key fields present emits zero warnings', () => {
    const { warnings } = parsePageItems(cleanFlightItems(), false);
    expect(warnings).toHaveLength(0);
  });

  // -- 6b. Missing registration → warning with callsign in reason -------------

  it('row missing registration emits a warning referencing the callsign', () => {
    // registration column range is [180,233]; remove those items
    const items = cleanFlightItems().filter(it => it.x < 180 || it.x > 233);
    const { flights, warnings } = parsePageItems(items, false);
    expect(flights).toHaveLength(1);
    expect(flights[0].registration).toBe('');

    expect(warnings).toHaveLength(1);
    const w = warnings[0] as ParseWarning;
    expect(w.row).toBe(1);
    expect(w.reason).toMatch(/sin matr[íi]cula/i);
    expect(w.reason).toContain('TXF99A');
  });

  // -- 6c. Item with x outside all column ranges → unmapped-item warning ------

  it('item with x outside all column ranges emits an unmapped-item warning', () => {
    const items: PdfItem[] = [
      { text: 'TST001',  x: 20.25,  y: 700, page: 0 },  // arr_callsign
      { text: 'EDMA',    x: 71.25,  y: 700, page: 0 },  // origin
      { text: 'D-FAKE',  x: 189.32, y: 700, page: 0 },  // registration
      // x=600 is beyond dep_time [544,579] — completely outside all ranges
      { text: 'MYSTERY', x: 600,    y: 700, page: 0 },
    ];
    const { flights, warnings } = parsePageItems(items, false);
    expect(flights).toHaveLength(1);

    const unmappedWarning = warnings.find(w => w.reason.includes('fuera de columna'));
    expect(unmappedWarning).toBeDefined();
    expect(unmappedWarning!.reason).toContain('"MYSTERY"');
    expect(unmappedWarning!.reason).toContain('x=600');
  });

  // -- 6d. Pure punctuation outside columns is NOT warned ---------------------

  it('pure punctuation text outside column ranges does not emit an unmapped warning', () => {
    const items: PdfItem[] = [
      { text: 'TST001', x: 20.25,  y: 700, page: 0 },
      { text: 'EDMA',   x: 71.25,  y: 700, page: 0 },
      { text: 'D-FAKE', x: 189.32, y: 700, page: 0 },
      // "/" at x=600 — outside all columns but pure punctuation → no warning
      { text: '/',      x: 600, y: 700, page: 0 },
    ];
    const { warnings } = parsePageItems(items, false);
    const unmappedWarning = warnings.find(w => w.reason.includes('fuera de columna'));
    expect(unmappedWarning).toBeUndefined();
  });

  // -- 6e. Header rows filtered before warning logic → no spurious warnings ---

  it('header rows filtered before warning logic produce no warnings', () => {
    const headerItems: PdfItem[] = [
      { text: 'Vuelo',    x: 20.25, y: 758.55, page: 0 },
      { text: 'Origen',   x: 73.18, y: 758.4,  page: 0 },
      { text: 'LLEGADAS', x: 73.08, y: 774.15, page: 0 },
    ];
    const { warnings } = parsePageItems(headerItems, true);
    expect(warnings).toHaveLength(0);
  });

  // -- 6f. Golden fixture: real clean data → 0 warnings ----------------------

  it.skipIf(!FIXTURE_AVAILABLE)('real fixture (cybermax-13apr) produces zero warnings — clean golden data', () => {
    const { warnings } = parsePageItems(fixturePage0, true);
    expect(warnings).toHaveLength(0);
  });

  // -- 6g. Two data rows: first is clean, second has unmapped text ------------

  it('when only the second row has an issue, warning.row is 2', () => {
    const items: PdfItem[] = [
      // Row 1 — clean (y=700)
      { text: 'TXF99A', x: 20.25,  y: 700, page: 0 },
      { text: 'EDMA',   x: 71.25,  y: 700, page: 0 },
      { text: 'D-FAKE', x: 189.32, y: 700, page: 0 },
      // Row 2 — has unmapped item (y=650)
      { text: 'GKR22B', x: 20.25,  y: 650, page: 0 },
      { text: 'LPFR',   x: 71.25,  y: 650, page: 0 },
      { text: 'OE-TST', x: 189.32, y: 650, page: 0 },
      { text: 'WEIRD',  x: 595,    y: 650, page: 0 },  // x=595: outside dep_time [544,579]
    ];
    const { flights, warnings } = parsePageItems(items, false);
    expect(flights).toHaveLength(2);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].row).toBe(2);
    expect(warnings[0].reason).toContain('GKR22B');
    expect(warnings[0].reason).toContain('"WEIRD"');
  });

  // -- 6h. Missing registration + unmapped text → two separate warnings -------

  it('row with both missing registration and unmapped text emits two warnings', () => {
    const items: PdfItem[] = [
      { text: 'TST001',  x: 20.25, y: 700, page: 0 },  // arr_callsign only — no registration
      { text: 'MYSTERY', x: 600,   y: 700, page: 0 },  // unmapped
    ];
    const { warnings } = parsePageItems(items, false);
    expect(warnings).toHaveLength(2);
    const reasonTexts = warnings.map(w => w.reason);
    expect(reasonTexts.some(r => /sin matr[íi]cula/i.test(r))).toBe(true);
    expect(reasonTexts.some(r => r.includes('fuera de columna'))).toBe(true);
  });
});
