import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseNetjetsPDF } from '../netjets.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, 'fixtures', 'netjets_sample.pdf');

let cached;
async function parseSample() {
  if (!cached) cached = await parseNetjetsPDF(readFileSync(FIXTURE));
  return cached;
}

describe('parseNetjetsPDF', () => {
  it('does not throw on the real fixture and returns a netjets envelope', async () => {
    const out = await parseSample();
    assert.equal(out.source, 'netjets');
    assert.ok(Array.isArray(out.flights), 'flights is an array');
    assert.ok(out.flights.length > 0, 'at least one flight detected');
    assert.equal(out.order, '2336205-33');
    assert.equal(out.reportDate, '2026-05-10');
    assert.match(out.generatedAt, /^2026-05-09T17:08:00Z$/);
  });

  it('detects every flight in the sample (10 movements, page 6 ignored)', async () => {
    const out = await parseSample();
    // Sample contains: page 1 (2), page 2 (2), page 3 (1), page 4 (1), page 5 (3) = 9 flights
    assert.equal(out.flights.length, 9, 'expected 9 flights from pages 1-5');
    const rqsts = out.flights.map((f) => f.rqst).sort();
    assert.deepEqual(rqsts, [
      '20284831', '20307566', '20384796', '20407949',
      '20455441', '20457186', '20457258', '20458524', '20459470',
    ]);
  });

  it('reconstructs surnames split across overflow chunks ("Steinbrugg" + "er" → "Steinbrugger")', async () => {
    const out = await parseSample();
    const flight = out.flights.find((f) => f.rqst === '20384796');
    assert.ok(flight, 'flight 20384796 (Steinbrugger family) found');
    const steinbruggers = flight.persons.filter((p) => p.surname === 'Steinbrugger');
    assert.equal(steinbruggers.length, 3, 'three Steinbruggers');
    for (const p of steinbruggers) {
      assert.equal(p.surname, 'Steinbrugger');
      assert.notEqual(p.surname, 'Steinbrugg');
    }
  });

  it('reconstructs given-name multi-chunk cells ("Karl Christoffer Luis" + "Matos" → single person)', async () => {
    const out = await parseSample();
    const flight = out.flights.find((f) => f.rqst === '20407949');
    assert.ok(flight, 'flight 20407949 found');
    const axelsson = flight.persons.find((p) => p.surname === 'Axelsson');
    assert.ok(axelsson, 'Axelsson found');
    assert.equal(axelsson.givenNames, 'Karl Christoffer Luis Matos');
    assert.equal(axelsson.fullName, 'Karl Christoffer Luis Matos Axelsson');
  });

  it('joins wrapped country values ("United" + "Kingdom")', async () => {
    const out = await parseSample();
    const flight = out.flights.find((f) => f.rqst === '20407949');
    const cuthill = flight.persons.find((p) => p.surname === 'Cuthill');
    assert.ok(cuthill, 'Cuthill found');
    assert.equal(cuthill.country, 'United Kingdom');
  });

  it('splits country with embedded expiry ("Netherlands 16 Oct 2033")', async () => {
    const out = await parseSample();
    // Van Hierden appears with embedded "Netherlands 16 Oct 2033" on page 1
    const flight = out.flights.find((f) => f.rqst === '20384796');
    const vanHierden = flight.persons.find((p) => p.surname === 'Van Hierden');
    assert.ok(vanHierden, 'Van Hierden found');
    assert.equal(vanHierden.country, 'Netherlands');
    assert.equal(vanHierden.docExpiry, '2033-10-16');
  });

  it('splits NID type with embedded number ("NID L0HM42YRP")', async () => {
    const out = await parseSample();
    const prochaska = out.flights
      .flatMap((f) => f.persons)
      .find((p) => p.surname === 'Prochaska');
    assert.ok(prochaska, 'Prochaska found');
    assert.equal(prochaska.docType, 'NID');
    assert.equal(prochaska.docNumber, 'L0HM42YRP');
  });

  it('omits pet entries from persons[] and warns about them', async () => {
    const out = await parseSample();
    const allPersons = out.flights.flatMap((f) => f.persons);
    for (const p of allPersons) {
      assert.doesNotMatch(p.givenNames || '', /^pet/i, 'no person whose givenNames starts with "Pet"');
      assert.notEqual(p.surname, 'Betsey', 'pet "Betsey" not in persons');
      assert.notEqual(p.surname, 'Sassy', 'pet "Sassy" not in persons');
      assert.notEqual(p.surname, 'Frankie', 'pet "Frankie" not in persons');
    }
    const petWarnings = out.parseWarnings.filter((w) => /pet/i.test(w));
    assert.ok(petWarnings.length >= 2, 'pet warnings emitted');
  });

  it('marks Cancelled flights with cancelled:true and empty persons[]', async () => {
    const out = await parseSample();
    const cancelled = out.flights.filter((f) => f.cancelled);
    assert.ok(cancelled.length >= 1, 'at least one cancelled flight');
    for (const f of cancelled) {
      assert.equal(f.cancelled, true);
      assert.equal(f.type, 'cancelled');
      assert.deepEqual(f.persons, []);
    }
    const cancelledRqsts = cancelled.map((f) => f.rqst);
    assert.ok(cancelledRqsts.includes('20457258'), 'flight 20457258 (LEIB→LEPA, NJE815N) is Cancelled');
  });

  it('classifies Ferry flights and Pax=0', async () => {
    const out = await parseSample();
    const ferries = out.flights.filter((f) => f.type === 'ferry');
    assert.ok(ferries.length >= 1, 'at least one ferry');
    for (const f of ferries) assert.equal(f.paxCount, 0);
  });

  it('parses ETD/ETA from combined cell "0630 Z 0900 Z"', async () => {
    const out = await parseSample();
    const f = out.flights.find((x) => x.rqst === '20407949');
    assert.equal(f.etd, '06:30');
    assert.equal(f.eta, '09:00');
    assert.equal(f.from, 'LEPA');
    assert.equal(f.to, 'EGBJ');
    assert.equal(f.callSign, 'NJE903M');
    assert.equal(f.tailNumber, 'CSLTM');
    assert.equal(f.acType, 'CE-680AS');
    assert.equal(f.operator, 'NJE');
    assert.equal(f.date, '2026-05-10');
    assert.equal(f.paxCount, 2);
    assert.equal(f.type, 'commercial');
  });

  it('extracts roles, gender, dob, doc and expiry for the first flight crew', async () => {
    const out = await parseSample();
    const f = out.flights.find((x) => x.rqst === '20407949');
    const cuthill = f.persons.find((p) => p.surname === 'Cuthill');
    assert.deepEqual(
      {
        givenNames: cuthill.givenNames,
        role: cuthill.role,
        gender: cuthill.gender,
        dob: cuthill.dob,
        docType: cuthill.docType,
        docNumber: cuthill.docNumber,
        country: cuthill.country,
        docExpiry: cuthill.docExpiry,
      },
      {
        givenNames: 'Jason Peter',
        role: 'PIC',
        gender: 'M',
        dob: '1979-12-04',
        docType: 'PP',
        docNumber: '543699593',
        country: 'United Kingdom',
        docExpiry: '2027-03-07',
      },
    );
  });

  it('marks "*** Modified ***" flights', async () => {
    const out = await parseSample();
    const modified = out.flights.filter((f) => f.modified);
    assert.ok(modified.length >= 1, 'at least one modified flight');
  });
});
