import { isInLocalWindow } from './time.js';

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Map cumulative EPNdB margin to AENA acoustic category.
 * Uses the strict thresholds from Ley 21/2003 art.76 (which the Guía 2026
 * paraphrases): Cat 4 = margin ≥ 15; Cat 3 = 10 ≤ margin < 15; Cat 2 = 5 ≤
 * margin < 10; Cat 1 = margin < 5.
 *
 * Returns `null` if the margin is unknown (caller should treat as
 * indeterminate — typical for legacy Annex 16 Ch.3 aircraft).
 */
export function categorizeNoise(cumulativeMarginEpndb) {
  if (cumulativeMarginEpndb == null || Number.isNaN(cumulativeMarginEpndb)) return null;
  if (cumulativeMarginEpndb < 5) return 'cat_1';
  if (cumulativeMarginEpndb < 10) return 'cat_2';
  if (cumulativeMarginEpndb < 15) return 'cat_3';
  return 'cat_4';
}

/**
 * Noise surcharge — applied as a percentage on T1 (landing) only.
 *
 * Eligibility: civil subsonic jets with MTOW ≥ 34 000 kg OR pax capacity > 19.
 * Turboprops (noiseChapter "10") are excluded by definition.
 */
export function noiseSurcharge({
  landingFee,
  mtowKg,
  noiseChapter,
  paxCapacityCertified,
  cumulativeMarginEpndb,
  arrivalDateUtc,
  tariff,
}) {
  const cfg = tariff.noise;

  if (!landingFee || landingFee <= 0) return { amount: 0, applied: false, reason: 'no_landing' };

  if (noiseChapter && cfg.eligibility.excludedNoiseChapters.includes(String(noiseChapter))) {
    return { amount: 0, applied: false, reason: 'turboprop_excluded' };
  }
  const meetsMtow = mtowKg && mtowKg >= cfg.eligibility.minMtowKgOrPaxCapacity.mtowKg;
  const meetsPax  = paxCapacityCertified && paxCapacityCertified > cfg.eligibility.minMtowKgOrPaxCapacity.paxCapacity;
  if (!meetsMtow && !meetsPax) return { amount: 0, applied: false, reason: 'below_eligibility_threshold' };

  const cat = categorizeNoise(cumulativeMarginEpndb);
  if (!cat) return { amount: 0, applied: false, reason: 'unknown_noise_category' };

  const isNight = arrivalDateUtc
    ? isInLocalWindow(arrivalDateUtc, cfg.nightWindowLocal.startHHMM, cfg.nightWindowLocal.endHHMM)
    : false;
  const pct = cfg.categories[cat][isNight ? 'nightPctOnT1' : 'dayPctOnT1'];
  if (!pct) return { amount: 0, applied: true, reason: `cat_${cat}_no_surcharge`, category: cat, isNight };

  const amount = round2(landingFee * (pct / 100));
  return { amount, applied: true, category: cat, isNight, pct };
}
