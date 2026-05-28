/**
 * Integration tests for pdf-microservice/src/parsers/netjets.js
 *
 * These tests require a synthetic fixture file at:
 *   pdf-microservice/src/parsers/__tests__/fixtures/netjets_sample.pdf
 *
 * The original fixture contained real passenger PII (names, passport numbers,
 * dates of birth) and has been removed from the repository.
 * Generate a synthetic fixture that matches the NetJets PDF format and update
 * the assertions below accordingly before running these tests.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseNetjetsPDF } from '../netjets.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, 'fixtures', 'netjets_sample.pdf');

describe.skipIf(!existsSync(FIXTURE))('parseNetjetsPDF — integration', () => {
  let parsed;

  beforeAll(async () => {
    parsed = await parseNetjetsPDF(readFileSync(FIXTURE));
  });

  it('returns a valid netjets envelope', () => {
    expect(parsed.source).toBe('netjets');
    expect(Array.isArray(parsed.flights)).toBe(true);
    expect(parsed.flights.length).toBeGreaterThan(0);
    expect(typeof parsed.order).toBe('string');
    expect(typeof parsed.reportDate).toBe('string');
    expect(typeof parsed.generatedAt).toBe('string');
    expect(Array.isArray(parsed.parseWarnings)).toBe(true);
  });

  it('each flight has required structural fields', () => {
    for (const f of parsed.flights) {
      expect(typeof f.rqst).toBe('string');
      expect(Array.isArray(f.persons)).toBe(true);
      expect(['commercial', 'ferry', 'cancelled']).toContain(f.type);
      expect(typeof f.callSign).toBe('string');
      expect(typeof f.date).toBe('string');
    }
  });

  it('cancelled flights have empty persons array and cancelled:true', () => {
    const cancelled = parsed.flights.filter((f) => f.cancelled);
    for (const f of cancelled) {
      expect(f.cancelled).toBe(true);
      expect(f.persons).toEqual([]);
    }
  });

  it('ferry flights have paxCount of 0', () => {
    const ferries = parsed.flights.filter((f) => f.type === 'ferry');
    for (const f of ferries) expect(f.paxCount).toBe(0);
  });

  it('persons have required fields and no raw pet entries', () => {
    const allPersons = parsed.flights.flatMap((f) => f.persons);
    if (allPersons.length === 0) return;
    for (const p of allPersons) {
      expect(typeof p.surname).toBe('string');
      expect(p.surname.length).toBeGreaterThan(0);
      expect(typeof p.role).toBe('string');
    }
  });

  it('ETD/ETA fields are present on commercial flights', () => {
    const commercial = parsed.flights.filter((f) => f.type === 'commercial');
    for (const f of commercial) {
      if (f.etd) expect(f.etd).toMatch(/^\d{2}:\d{2}$/);
      if (f.eta) expect(f.eta).toMatch(/^\d{2}:\d{2}$/);
    }
  });
});
