import { describe, it, expect } from 'vitest';
import { loadTariff } from '../src/tariffs/index.js';
import { classifyRoute, classifyRoutePrivate } from '../src/calc/airports.js';
import { landingFee } from '../src/calc/landing.js';
import { transitFee } from '../src/calc/transit.js';
import { noiseSurcharge, categorizeNoise } from '../src/calc/noise.js';
import { parkingFee } from '../src/calc/parking.js';
import { paxFees } from '../src/calc/pax.js';
import { calculateAenaFees } from '../src/calc/index.js';
import { combineZulu, isInLocalWindow } from '../src/calc/time.js';

const tariff = loadTariff('LEPA');

describe('classifyRoute', () => {
  it('classifies Baleares pairs as interislands', () => {
    expect(classifyRoute('LEIB', tariff)).toBe('interislands');
    expect(classifyRoute('LEMH', tariff)).toBe('interislands');
  });
  it('classifies peninsular Spanish airports correctly', () => {
    expect(classifyRoute('LEMD', tariff)).toBe('with_peninsula');
    expect(classifyRoute('LEBL', tariff)).toBe('with_peninsula');
  });
  it('classifies EEA destinations as eee', () => {
    expect(classifyRoute('LFPB', tariff)).toBe('eee');   // Paris Le Bourget
    expect(classifyRoute('EDDM', tariff)).toBe('eee');   // Munich
  });
  it('classifies non-EEA destinations as international', () => {
    expect(classifyRoute('EGLF', tariff)).toBe('international'); // UK post-Brexit
    expect(classifyRoute('KJFK', tariff)).toBe('international');
    expect(classifyRoute('LSZH', tariff)).toBe('international'); // Switzerland
  });
  it('classifyRoutePrivate forces interislands/peninsular into eee', () => {
    expect(classifyRoutePrivate('LEIB', tariff)).toBe('eee');
    expect(classifyRoutePrivate('LEMD', tariff)).toBe('eee');
    expect(classifyRoutePrivate('KJFK', tariff)).toBe('international');
  });
});

describe('landingFee', () => {
  it('charges the minimum when MTOW*rate is below minPerOperation (commercial EEA)', () => {
    // Cessna Mustang 3.921 tm * 8.140706 = 31.91 € → below 110.66 min
    expect(landingFee({ mtowKg: 3921, originIcao: 'LFPB', commercial: true, tariff }))
      .toBe(110.66);
  });
  it('charges peninsular rate for commercial PMI←MAD', () => {
    // 18.416 tm * 6.919600 = 127.43 €
    const v = landingFee({ mtowKg: 18416, originIcao: 'LEMD', commercial: true, tariff });
    expect(v).toBeCloseTo(127.43, 2);
  });
  it('forces EEE/Intl rate on a private PMI←MAD', () => {
    // 18.416 tm * 8.140706 = 149.92 €
    const v = landingFee({ mtowKg: 18416, originIcao: 'LEMD', commercial: false, tariff });
    expect(v).toBeCloseTo(149.92, 2);
  });
  it('charges interislands rate for commercial PMI←IBZ', () => {
    // 18.416 tm * 2.442212 = 44.98 €; min 33.20 → 44.98
    const v = landingFee({ mtowKg: 18416, originIcao: 'LEIB', commercial: true, tariff });
    expect(v).toBeCloseTo(44.98, 2);
  });
});

describe('transitFee', () => {
  it('uses minimum on small aircraft', () => {
    expect(transitFee({ mtowKg: 5000, originIcao: 'LFPB', commercial: true, tariff }))
      .toBe(47.47);
  });
  it('computes by tonnage above the minimum', () => {
    // 45.132 tm * 3.185764 = 143.78 €
    const v = transitFee({ mtowKg: 45132, originIcao: 'KJFK', commercial: false, tariff });
    expect(v).toBeCloseTo(143.78, 2);
  });
});

describe('categorizeNoise + noiseSurcharge', () => {
  it('categorizes margin boundaries correctly', () => {
    expect(categorizeNoise(4.9)).toBe('cat_1');
    expect(categorizeNoise(5)).toBe('cat_2');
    expect(categorizeNoise(9.99)).toBe('cat_2');
    expect(categorizeNoise(10)).toBe('cat_3');
    expect(categorizeNoise(14.99)).toBe('cat_3');
    expect(categorizeNoise(15)).toBe('cat_4');
    expect(categorizeNoise(null)).toBeNull();
  });
  it('does not apply to turboprops', () => {
    const r = noiseSurcharge({
      landingFee: 200, mtowKg: 4740, noiseChapter: '10',
      paxCapacityCertified: 9, cumulativeMarginEpndb: null,
      arrivalDateUtc: new Date(Date.UTC(2026, 4, 18, 10, 0)),
      tariff,
    });
    expect(r.applied).toBe(false);
    expect(r.reason).toBe('turboprop_excluded');
  });
  it('does not apply below MTOW 34t and ≤19 pax', () => {
    const r = noiseSurcharge({
      landingFee: 200, mtowKg: 18416, noiseChapter: '4',
      paxCapacityCertified: 10, cumulativeMarginEpndb: 26.4,
      arrivalDateUtc: new Date(Date.UTC(2026, 4, 18, 10, 0)),
      tariff,
    });
    expect(r.applied).toBe(false);
    expect(r.reason).toBe('below_eligibility_threshold');
  });
  it('zero surcharge for Cat 4 even when eligible', () => {
    const r = noiseSurcharge({
      landingFee: 367.21, mtowKg: 45132, noiseChapter: '4',
      paxCapacityCertified: 17, cumulativeMarginEpndb: 21.6,
      arrivalDateUtc: new Date(Date.UTC(2026, 4, 18, 10, 0)),
      tariff,
    });
    expect(r.applied).toBe(true);
    expect(r.category).toBe('cat_4');
    expect(r.amount).toBe(0);
  });
  it('applies night Cat 1 +140% on T1', () => {
    // Local night in Palma in May (CEST = UTC+2): 23:00–06:59 local = 21:00–04:59 UTC
    const arrival = new Date(Date.UTC(2026, 4, 18, 22, 30)); // 00:30 CEST → night
    const r = noiseSurcharge({
      landingFee: 1000, mtowKg: 40000, noiseChapter: '3',
      paxCapacityCertified: 12, cumulativeMarginEpndb: 3,
      arrivalDateUtc: arrival, tariff,
    });
    expect(r.applied).toBe(true);
    expect(r.category).toBe('cat_1');
    expect(r.isNight).toBe(true);
    expect(r.amount).toBe(1400);
  });
});

describe('parkingFee', () => {
  it('returns 0 when on-blocks ≥ off-blocks', () => {
    const t = new Date('2026-05-18T10:00:00Z');
    expect(parkingFee({ mtowKg: 10000, onBlocksUtc: t, offBlocksUtc: t, tariff })).toBe(0);
  });
  it('charges full slots in a normal daytime stay', () => {
    // 10 tm * 0.166644 €/tm/15min = 1.66644 €/slot
    // 1h daytime stay = 4 slots → 6.67 €
    const on = new Date('2026-05-18T09:00:00Z'); // 11:00 CEST
    const off = new Date('2026-05-18T10:00:00Z'); // 12:00 CEST
    const v = parkingFee({ mtowKg: 10000, onBlocksUtc: on, offBlocksUtc: off, tariff });
    expect(v).toBeCloseTo(6.67, 2);
  });
  it('skips the local 00:00–06:00 freeze window', () => {
    // Stay 22:00–08:00 UTC = 00:00 CEST → 10:00 CEST in summer.
    // Freeze 00:00–06:00 local skips 6h, billable = 4h = 16 slots.
    // 10 tm * 0.166644 * 16 = 26.66 €
    const on = new Date('2026-05-17T22:00:00Z');
    const off = new Date('2026-05-18T08:00:00Z');
    const v = parkingFee({ mtowKg: 10000, onBlocksUtc: on, offBlocksUtc: off, tariff });
    expect(v).toBeCloseTo(26.66, 2);
  });
  it('applies the first-24h cap', () => {
    // Heavy aircraft (50 tm) parked all day → would exceed the 2227.74 cap.
    // 50 tm * 0.166644 * 4 slots/hour = 33.33 €/hour
    // 18 billable hours/day (24 - 6 freeze) → 600 € → far below cap.
    // Test cap with very heavy 200 tm: 133.32 €/h * 18 = 2399.76 → capped 2227.74
    const on = new Date('2026-05-18T06:00:00Z'); // 08:00 CEST
    const off = new Date('2026-05-19T06:00:00Z'); // 24h later
    const v = parkingFee({ mtowKg: 200000, onBlocksUtc: on, offBlocksUtc: off, tariff });
    expect(v).toBe(2227.74);
  });
});

describe('paxFees', () => {
  it('returns zeros when paxOutbound is 0', () => {
    const r = paxFees({ paxOutbound: 0, destinationIcao: 'LFPB', commercial: false, mtowKg: 10000, tariff });
    expect(r).toEqual({ pax: 0, pmr: 0, securityAena: 0, securityAesa: 0 });
  });
  it('exempts private MTOW<5t from pax/pmr/security', () => {
    const r = paxFees({ paxOutbound: 4, destinationIcao: 'LFPB', commercial: false, mtowKg: 4000, tariff });
    expect(r).toEqual({ pax: 0, pmr: 0, securityAena: 0, securityAesa: 0 });
  });
  it('charges EEE pax rate for private to LFPB', () => {
    // 4 pax * 5.85 = 23.40; PMR 4*0.87=3.48; SecAena 4*3.99=15.96; SecAesa 4*0.63=2.52
    const r = paxFees({
      paxOutbound: 4, destinationIcao: 'LFPB', commercial: false, mtowKg: 18416,
      departureDateUtc: new Date('2026-05-18T12:00:00Z'), tariff,
    });
    expect(r.pax).toBeCloseTo(23.40, 2);
    expect(r.pmr).toBeCloseTo(3.48, 2);
    expect(r.securityAena).toBeCloseTo(15.96, 2);
    expect(r.securityAesa).toBeCloseTo(2.52, 2);
  });
  it('applies winter Baleares -20% in January', () => {
    // 5 pax to LFPB private, in January → pax 5*5.85*0.8 = 23.40
    const r = paxFees({
      paxOutbound: 5, destinationIcao: 'LFPB', commercial: false, mtowKg: 18416,
      departureDateUtc: new Date('2026-01-18T12:00:00Z'), tariff,
    });
    expect(r.pax).toBeCloseTo(23.40, 2);
    expect(r.securityAena).toBeCloseTo(15.96, 2); // 5*3.99*0.8
  });
  it('applies -40% connection discount', () => {
    // 5 pax (2 conexión) to LFPB private: (3 direct + 2 conn * 0.6) * 5.85 = 4.2 * 5.85 = 24.57
    const r = paxFees({
      paxOutbound: 5, connectionPax: 2, destinationIcao: 'LFPB',
      commercial: false, mtowKg: 18416,
      departureDateUtc: new Date('2026-05-18T12:00:00Z'), tariff,
    });
    expect(r.pax).toBeCloseTo(24.57, 2);
  });
});

describe('combineZulu / isInLocalWindow', () => {
  it('combines a scheduledDate (UTC midnight) with HH:MM Zulu', () => {
    const d = combineZulu(new Date('2026-05-18T00:00:00Z'), '14:30');
    expect(d.toISOString()).toBe('2026-05-18T14:30:00.000Z');
  });
  it('detects Palma-local night window for a winter early-AM Zulu time', () => {
    // 04:00Z in January = 05:00 CET → still in 00:00–07:00 night window
    const d = new Date('2026-01-18T04:00:00Z');
    expect(isInLocalWindow(d, '23:00', '07:00')).toBe(true);
  });
  it('detects Palma-local day for noon Zulu summer', () => {
    const d = new Date('2026-06-18T10:00:00Z'); // 12:00 CEST
    expect(isInLocalWindow(d, '23:00', '07:00')).toBe(false);
  });
});

describe('calculateAenaFees orchestrator', () => {
  const baseAircraft = {
    mtowKg: 18416, noiseChapter: '4', paxCapacityCertified: 10,
    cumulativeMarginEpndb: 26.4, // CL35 → Cat 4
  };

  it('Cat 4 mid-size private CL35 PMI→LFPB 4 pax, summer day', () => {
    const r = calculateAenaFees({
      aircraft: baseAircraft,
      tariff,
      payload: {
        operator: { isStateAircraft: false },
        arrival: {
          scheduledDate: '2026-05-18T00:00:00.000Z',
          eta: '08:00', ata: '08:05', origin: 'LFPB',
          paxCount: 4, paxCountReal: 4, commercialFlag: false,
        },
        departure: {
          scheduledDate: '2026-05-18T00:00:00.000Z',
          etd: '15:00', atd: '15:10', destination: 'LFPB',
          paxCount: 4, paxCountReal: 4, commercialFlag: false,
        },
      },
    });
    expect(r.mode).toBe('final');
    expect(r.tariffVersion).toBe('lepa-2026-03');
    expect(r.breakdown.noise).toBe(0);              // Cat 4 → 0
    expect(r.breakdown.landing).toBeCloseTo(149.92, 2);
    expect(r.breakdown.transit).toBeCloseTo(58.67, 2); // 18.416*3.185764=58.67
    expect(r.breakdown.paxOutbound).toBeCloseTo(23.40, 2);
    expect(r.breakdown.pmr).toBeCloseTo(3.48, 2);
    expect(r.breakdown.securityAena).toBeCloseTo(15.96, 2);
    expect(r.breakdown.securityAesa).toBeCloseTo(2.52, 2);
    expect(r.surcharges.cnmcPct).toBe(0.12);
    expect(r.total).toBeGreaterThan(0);
  });

  it('state aircraft → full exemption (all zeros)', () => {
    const r = calculateAenaFees({
      aircraft: baseAircraft,
      tariff,
      payload: {
        operator: { isStateAircraft: true },
        arrival: { scheduledDate: '2026-05-18T00:00:00.000Z', ata: '08:00', origin: 'LEMD', paxCount: 4, commercialFlag: true },
        departure: { scheduledDate: '2026-05-18T00:00:00.000Z', atd: '14:00', destination: 'LEMD', paxCount: 4, commercialFlag: true },
      },
    });
    expect(r.total).toBe(0);
    expect(r.stateExempt).toBe(true);
    expect(r.breakdown.landing).toBe(0);
  });

  it('provisional mode when real times/pax are missing', () => {
    const r = calculateAenaFees({
      aircraft: baseAircraft, tariff,
      payload: {
        operator: { isStateAircraft: false },
        arrival: { scheduledDate: '2026-05-18T00:00:00.000Z', eta: '08:00', origin: 'LFPB', paxCount: 4, commercialFlag: false },
        departure: { scheduledDate: '2026-05-18T00:00:00.000Z', etd: '15:00', destination: 'LFPB', paxCount: 4, commercialFlag: false },
      },
    });
    expect(r.mode).toBe('provisional');
  });

  it('noise surcharge fires on a heavy night arrival Cat 1', () => {
    const r = calculateAenaFees({
      aircraft: { mtowKg: 41000, noiseChapter: '3', paxCapacityCertified: 16, cumulativeMarginEpndb: 3 },
      tariff,
      payload: {
        operator: { isStateAircraft: false },
        arrival: { scheduledDate: '2026-05-17T00:00:00.000Z', ata: '22:30', origin: 'KJFK', paxCount: 8, paxCountReal: 8, commercialFlag: false },
        departure: { scheduledDate: '2026-05-18T00:00:00.000Z', atd: '12:00', destination: 'EGLF', paxCount: 8, paxCountReal: 8, commercialFlag: false },
      },
    });
    expect(r.breakdown.noise).toBeGreaterThan(0);
    // 41 tm * 8.140706 = 333.77 €; *140% = 467.27 €
    expect(r.breakdown.noise).toBeCloseTo(467.27, 1);
  });
});
