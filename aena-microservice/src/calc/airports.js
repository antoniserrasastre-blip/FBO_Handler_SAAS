/**
 * Classify the relationship between LEPA and the other endpoint of a leg
 * (arrival's `origin` or departure's `destination`). Returns one of:
 *   - "interislands"     — between Balearic airports
 *   - "with_peninsula"   — peninsular Spain (LE… excluding the islands)
 *   - "eee"              — EEA destination (not peninsular Spain)
 *   - "international"    — non-EEA destination
 *
 * `otherIcao` is the 4-letter ICAO of the non-LEPA endpoint. If it's missing
 * or unrecognised, defaults to "international" (worst case → safer to invoice).
 */
export function classifyRoute(otherIcao, tariff) {
  if (!otherIcao) return 'international';
  const ic = String(otherIcao).trim().toUpperCase();
  if (!ic) return 'international';
  if (tariff.balearesIcao.includes(ic)) return 'interislands';

  const prefix = ic.slice(0, 2);
  const isLE = prefix === 'LE';
  const isBaleares = tariff.balearesIcao.includes(ic);

  if (isLE && !isBaleares) return 'with_peninsula';
  if (tariff.eeaIcaoPrefixes.includes(prefix)) return 'eee';
  return 'international';
}

/**
 * For private flights, the Guía forces section 2.1.1 / 2.2.1 ("EEE or
 * International") regardless of route. Within that section, the pax tariff
 * still differentiates by destination country.
 */
export function classifyRoutePrivate(otherIcao, tariff) {
  const raw = classifyRoute(otherIcao, tariff);
  if (raw === 'interislands' || raw === 'with_peninsula') {
    // Private flights to Spain still use 2.1.1, and 2.1.1's pax cell for an
    // EEA destination is "eee" (5.85 €).
    return 'eee';
  }
  return raw;
}
