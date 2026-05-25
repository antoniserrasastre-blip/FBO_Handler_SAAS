import { isInLocalWindow } from './time.js';

const round2 = (n) => Math.round(n * 100) / 100;
const FIFTEEN_MIN_MS = 15 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Parking fee. Walks 15-min slots between arrival on-blocks (`ata`) and
 * departure off-blocks (`atd`). Slots whose START falls within the local
 * freeze window 00:00–06:00 are not counted (cómputo se interrumpe).
 * Caps: 2 227,74 € for the first 24 h, 1 214,18 € per 24 h thereafter.
 */
export function parkingFee({ mtowKg, onBlocksUtc, offBlocksUtc, tariff }) {
  if (!(mtowKg > 0) || !onBlocksUtc || !offBlocksUtc) return 0;
  if (offBlocksUtc <= onBlocksUtc) return 0;

  const cfg = tariff.parking;
  const mtowTm = mtowKg / 1000;
  const ratePerSlot = cfg.ratePerTmPer15min * mtowTm;
  const courtesyMs = (cfg.courtesyMinutesAfterLanding || 0) * 60 * 1000;

  // Round on-blocks up to the next 15-min boundary minus courtesy.
  let cursor = new Date(onBlocksUtc.getTime() + courtesyMs);
  cursor = new Date(Math.ceil(cursor.getTime() / FIFTEEN_MIN_MS) * FIFTEEN_MIN_MS);

  // Round off-blocks up to the next 15-min boundary (ceil per "or fraction").
  const endRounded = new Date(Math.ceil(offBlocksUtc.getTime() / FIFTEEN_MIN_MS) * FIFTEEN_MIN_MS);

  if (endRounded <= cursor) return 0;

  // Walk slots, accumulating into the 24-hour bucket the slot belongs to
  // (counted from on-blocks).
  const dayBuckets = new Map();
  while (cursor < endRounded) {
    const inFreeze = isInLocalWindow(
      cursor,
      cfg.freezeWindowLocal.startHHMM,
      cfg.freezeWindowLocal.endHHMM,
    );
    if (!inFreeze) {
      const dayIdx = Math.floor((cursor.getTime() - onBlocksUtc.getTime()) / DAY_MS);
      dayBuckets.set(dayIdx, (dayBuckets.get(dayIdx) || 0) + ratePerSlot);
    }
    cursor = new Date(cursor.getTime() + FIFTEEN_MIN_MS);
  }

  let total = 0;
  for (const [dayIdx, gross] of dayBuckets) {
    const cap = dayIdx === 0 ? cfg.maxFirst24h : cfg.maxPer24hAfterSecondDay;
    total += Math.min(gross, cap);
  }
  return round2(total);
}
