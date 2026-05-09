import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseNetjetsPDF } from '../netjets.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, 'fixtures', 'netjets_sample.pdf');

let parsed;

beforeAll(async () => {
  parsed = await parseNetjetsPDF(readFileSync(FIXTURE));
});

describe('parseNetjetsPDF', () => {
  it('does not throw on the real fixture and returns a netjets envelope', () => {
    expect(parsed.source).toBe('netjets');
    expect(Array.isArray(parsed.flights)).toBe(true);
    expect(parsed.flights.length).toBeGreaterThan(0);
    expect(parsed.order).toBe('2336205-33');
    expect(parsed.reportDate).toBe('2026-05-10');
    expect(parsed.generatedAt).toMatch(/^2026-05-09T17:08:00Z$/);
  });

  it('detects every flight in the sample (page 6 ignored)', () => {
    // Pages 1 (2) + 2 (2) + 3 (1) + 4 (1) + 5 (3) = 9 flights.
    expect(parsed.flights).toHaveLength(9);
    expect(parsed.flights.map((f) => f.rqst).sort()).toEqual([
      '20284831', '20307566', '20384796', '20407949',
      '20455441', '20457186', '20457258', '20458524', '20459470',
    ]);
  });

  it('reconstructs surnames split across overflow chunks ("Steinbrugg" + "er" → "Steinbrugger")', () => {
    const flight = parsed.flights.find((f) => f.rqst === '20384796');
    expect(flight, 'flight 20384796 (Steinbrugger family) found').toBeTruthy();
    const steinbruggers = flight.persons.filter((p) => p.surname === 'Steinbrugger');
    expect(steinbruggers).toHaveLength(3);
    for (const p of steinbruggers) {
      expect(p.surname).toBe('Steinbrugger');
      expect(p.surname).not.toBe('Steinbrugg');
    }
  });

  it('reconstructs given-name multi-chunk cells ("Karl Christoffer Luis" + "Matos" → single person)', () => {
    const flight = parsed.flights.find((f) => f.rqst === '20407949');
    const axelsson = flight.persons.find((p) => p.surname === 'Axelsson');
    expect(axelsson).toBeTruthy();
    expect(axelsson.givenNames).toBe('Karl Christoffer Luis Matos');
    expect(axelsson.fullName).toBe('Karl Christoffer Luis Matos Axelsson');
  });

  it('joins wrapped country values ("United" + "Kingdom")', () => {
    const flight = parsed.flights.find((f) => f.rqst === '20407949');
    const cuthill = flight.persons.find((p) => p.surname === 'Cuthill');
    expect(cuthill).toBeTruthy();
    expect(cuthill.country).toBe('United Kingdom');
  });

  it('splits country with embedded expiry ("Netherlands 16 Oct 2033")', () => {
    const flight = parsed.flights.find((f) => f.rqst === '20384796');
    const vanHierden = flight.persons.find((p) => p.surname === 'Van Hierden');
    expect(vanHierden).toBeTruthy();
    expect(vanHierden.country).toBe('Netherlands');
    expect(vanHierden.docExpiry).toBe('2033-10-16');
  });

  it('splits NID type with embedded number ("NID L0HM42YRP")', () => {
    const prochaska = parsed.flights
      .flatMap((f) => f.persons)
      .find((p) => p.surname === 'Prochaska');
    expect(prochaska).toBeTruthy();
    expect(prochaska.docType).toBe('NID');
    expect(prochaska.docNumber).toBe('L0HM42YRP');
  });

  it('omits pet entries from persons[] and warns about them', () => {
    const allPersons = parsed.flights.flatMap((f) => f.persons);
    for (const p of allPersons) {
      expect(p.givenNames || '').not.toMatch(/^pet/i);
      expect(p.surname).not.toBe('Betsey');
      expect(p.surname).not.toBe('Sassy');
      expect(p.surname).not.toBe('Frankie');
    }
    const petWarnings = parsed.parseWarnings.filter((w) => /pet/i.test(w));
    expect(petWarnings.length).toBeGreaterThanOrEqual(2);
  });

  it('marks Cancelled flights with cancelled:true and empty persons[]', () => {
    const cancelled = parsed.flights.filter((f) => f.cancelled);
    expect(cancelled.length).toBeGreaterThanOrEqual(1);
    for (const f of cancelled) {
      expect(f.cancelled).toBe(true);
      expect(f.type).toBe('cancelled');
      expect(f.persons).toEqual([]);
    }
    expect(cancelled.map((f) => f.rqst)).toContain('20457258');
  });

  it('classifies Ferry flights with Pax=0', () => {
    const ferries = parsed.flights.filter((f) => f.type === 'ferry');
    expect(ferries.length).toBeGreaterThanOrEqual(1);
    for (const f of ferries) expect(f.paxCount).toBe(0);
  });

  it('parses ETD/ETA from the combined cell "0630 Z 0900 Z"', () => {
    const f = parsed.flights.find((x) => x.rqst === '20407949');
    expect(f).toMatchObject({
      etd: '06:30',
      eta: '09:00',
      from: 'LEPA',
      to: 'EGBJ',
      callSign: 'NJE903M',
      tailNumber: 'CSLTM',
      acType: 'CE-680AS',
      operator: 'NJE',
      date: '2026-05-10',
      paxCount: 2,
      type: 'commercial',
    });
  });

  it('extracts roles, gender, dob, doc and expiry for the first flight PIC', () => {
    const f = parsed.flights.find((x) => x.rqst === '20407949');
    const cuthill = f.persons.find((p) => p.surname === 'Cuthill');
    expect(cuthill).toMatchObject({
      givenNames: 'Jason Peter',
      role: 'PIC',
      gender: 'M',
      dob: '1979-12-04',
      docType: 'PP',
      docNumber: '543699593',
      country: 'United Kingdom',
      docExpiry: '2027-03-07',
      unmatched: false,
    });
  });

  it('marks "*** Modified ***" flights', () => {
    const modified = parsed.flights.filter((f) => f.modified);
    expect(modified.length).toBeGreaterThanOrEqual(1);
  });
});
