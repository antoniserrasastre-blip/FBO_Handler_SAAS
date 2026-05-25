import { combineZulu } from './time.js';
import { landingFee } from './landing.js';
import { transitFee } from './transit.js';
import { noiseSurcharge } from './noise.js';
import { parkingFee } from './parking.js';
import { paxFees } from './pax.js';

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Orchestrator. Takes a normalised request payload + the stored aircraft
 * data + the tariff JSON, returns the AENA fee breakdown for the visit.
 *
 * @returns {{
 *   mode: "provisional" | "final",
 *   total: number,
 *   breakdown: { landing, transit, noise, parking, paxOutbound, pmr, securityAena, securityAesa },
 *   surcharges: { cnmcPct, cnmcAmount },
 *   tariffVersion: string,
 *   stateExempt?: boolean,
 *   notes?: string[]
 * }}
 */
export function calculateAenaFees({ payload, aircraft, tariff }) {
  const notes = [];

  // --- State-aircraft exemption: short-circuit to zeros ---
  if (payload.operator?.isStateAircraft) {
    return {
      mode: 'final',
      total: 0,
      breakdown: {
        landing: 0, transit: 0, noise: 0, parking: 0,
        paxOutbound: 0, pmr: 0, securityAena: 0, securityAesa: 0,
      },
      surcharges: { cnmcPct: tariff.cnmcSurchargePct, cnmcAmount: 0 },
      tariffVersion: tariff.version,
      stateExempt: true,
      notes: ['state_aircraft_full_exemption'],
    };
  }

  const a = payload.arrival || {};
  const d = payload.departure || {};

  // --- Mode (provisional vs final) ---
  const allRealTimes =
    !!a.ata && !!d.atd && a.paxCountReal != null && d.paxCountReal != null;
  const mode = allRealTimes ? 'final' : 'provisional';

  const arrivalOnBlocksUtc =
    combineZulu(a.scheduledDate, a.ata) || combineZulu(a.scheduledDate, a.eta);
  const departureOffBlocksUtc =
    combineZulu(d.scheduledDate, d.atd) || combineZulu(d.scheduledDate, d.etd);

  const arrivalPax = a.paxCountReal != null ? a.paxCountReal : (a.paxCount || 0);
  const departurePax = d.paxCountReal != null ? d.paxCountReal : (d.paxCount || 0);

  // --- T1 / T2 / Noise — driven by the ARRIVAL leg ---
  const training = a.flightCategory === 'TRAINING' || d.flightCategory === 'TRAINING';

  const landing = landingFee({
    mtowKg: aircraft.mtowKg,
    originIcao: a.origin,
    commercial: !!a.commercialFlag,
    training,
    tariff,
  });
  const transit = transitFee({
    mtowKg: aircraft.mtowKg,
    originIcao: a.origin,
    commercial: !!a.commercialFlag,
    training,
    tariff,
  });
  const noise = noiseSurcharge({
    landingFee: landing,
    mtowKg: aircraft.mtowKg,
    noiseChapter: aircraft.noiseChapter,
    paxCapacityCertified: aircraft.paxCapacityCertified,
    cumulativeMarginEpndb: aircraft.cumulativeMarginEpndb,
    arrivalDateUtc: arrivalOnBlocksUtc,
    tariff,
  });
  if (noise.applied === false && noise.reason === 'unknown_noise_category' && aircraft.mtowKg >= 34000) {
    notes.push('noise_category_unknown_eligible_aircraft');
  }

  // --- Parking — driven by both legs ---
  const parking = parkingFee({
    mtowKg: aircraft.mtowKg,
    onBlocksUtc: arrivalOnBlocksUtc,
    offBlocksUtc: departureOffBlocksUtc,
    tariff,
  });

  // --- Pax + PMR + Security — driven by the DEPARTURE leg ---
  const paxBlock = paxFees({
    paxOutbound: departurePax,
    connectionPax: d.connectionPax || 0,
    destinationIcao: d.destination,
    commercial: !!d.commercialFlag,
    mtowKg: aircraft.mtowKg,
    departureDateUtc: departureOffBlocksUtc,
    tariff,
  });

  const subtotal = round2(
    landing + transit + noise.amount + parking +
    paxBlock.pax + paxBlock.pmr + paxBlock.securityAena + paxBlock.securityAesa,
  );
  const cnmcAmount = round2(subtotal * (tariff.cnmcSurchargePct / 100));
  const total = round2(subtotal + cnmcAmount);

  return {
    mode,
    total,
    breakdown: {
      landing,
      transit,
      noise: noise.amount,
      parking,
      paxOutbound: paxBlock.pax,
      pmr: paxBlock.pmr,
      securityAena: paxBlock.securityAena,
      securityAesa: paxBlock.securityAesa,
    },
    surcharges: { cnmcPct: tariff.cnmcSurchargePct, cnmcAmount },
    tariffVersion: tariff.version,
    notes,
    // Internal-only audit fields (logged but not surfaced to UI):
    _audit: {
      arrivalOnBlocksUtc: arrivalOnBlocksUtc?.toISOString() ?? null,
      departureOffBlocksUtc: departureOffBlocksUtc?.toISOString() ?? null,
      arrivalPax,
      departurePax,
      noiseInfo: noise,
    },
  };
}
