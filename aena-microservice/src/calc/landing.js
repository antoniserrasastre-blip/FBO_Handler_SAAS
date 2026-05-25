import { classifyRoute, classifyRoutePrivate } from './airports.js';

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * T1 — landing fee, charged once per ARRIVAL.
 *
 * @param {object} args
 * @param {number} args.mtowKg
 * @param {string|null} args.originIcao    ICAO of where the flight came from
 * @param {boolean} args.commercial         true = commercial regulated; false = private
 * @param {boolean} [args.training]
 * @param {object} args.tariff
 * @returns {number} fee in EUR (already rounded to cents)
 */
export function landingFee({ mtowKg, originIcao, commercial, training = false, tariff }) {
  if (!(mtowKg > 0)) return 0;

  const mtowTm = mtowKg / 1000;
  const t = tariff.landing;

  if (training) {
    return round2(mtowTm * t.training.ratePerTm);
  }

  const section = commercial
    ? classifyRoute(originIcao, tariff)
    : classifyRoutePrivate(originIcao, tariff);

  // For landing, the EEE and "international" rates collapse into the same
  // section ("eee_international"). Map accordingly.
  const tariffSection = (section === 'eee' || section === 'international')
    ? 'eee_international'
    : section;

  const cfg = t[tariffSection];
  if (!cfg) return 0;
  const raw = mtowTm * cfg.ratePerTm;
  return round2(Math.max(raw, cfg.minPerOperation || 0));
}
