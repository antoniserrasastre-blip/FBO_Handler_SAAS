import { classifyRoute, classifyRoutePrivate } from './airports.js';

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * T2 — aerodrome transit fee, charged once per ARRIVAL (paired with T1).
 * LEPA is ATC, so AFIS reduction does not apply by default.
 */
export function transitFee({ mtowKg, originIcao, commercial, training = false, afis = false, tariff }) {
  if (!(mtowKg > 0)) return 0;

  const mtowTm = mtowKg / 1000;
  const t = tariff.transit;

  if (training) {
    const raw = mtowTm * t.training.ratePerTm;
    return round2(afis ? raw * (1 - (t.afisReductionPct / 100)) : raw);
  }

  const section = commercial
    ? classifyRoute(originIcao, tariff)
    : classifyRoutePrivate(originIcao, tariff);
  const tariffSection = (section === 'eee' || section === 'international')
    ? 'eee_international'
    : section;

  const cfg = t[tariffSection];
  if (!cfg) return 0;
  let raw = Math.max(mtowTm * cfg.ratePerTm, cfg.minPerOperation || 0);
  if (afis) raw *= (1 - (t.afisReductionPct / 100));
  return round2(raw);
}
