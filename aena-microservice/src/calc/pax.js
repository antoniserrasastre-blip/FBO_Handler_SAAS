import { classifyRoute, classifyRoutePrivate } from './airports.js';
import { palmaLocal } from './time.js';

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Resolve which tariff bucket applies to a leg.
 *  - For pax T_PAX the buckets are: eee | international | with_peninsula | interislands
 *  - For PMR the buckets collapse "eee"/"international" into a single 0.87 € value.
 *  - For Security AENA / Security AESA the same EEE/Intl rate applies to both.
 */
function resolveSection({ destinationIcao, commercial, tariff }) {
  return commercial
    ? classifyRoute(destinationIcao, tariff)
    : classifyRoutePrivate(destinationIcao, tariff);
}

function isWinterMonth(months, dateUtc) {
  if (!dateUtc) return false;
  const { month } = palmaLocal(dateUtc);
  return months.includes(month);
}

/**
 * Compute T_PAX (Pasajero), PMR and Security AENA in one pass — they share
 * the same exemption rules and the same per-outbound-pax structure.
 *
 * @param {object} args
 * @param {number} args.paxOutbound          outgoing passenger count
 * @param {number} args.connectionPax        of which are in connection (≤ paxOutbound)
 * @param {string|null} args.destinationIcao
 * @param {boolean} args.commercial
 * @param {number} args.mtowKg
 * @param {Date|null} args.departureDateUtc  used for winter Baleares discount
 * @param {object} args.tariff
 */
export function paxFees({
  paxOutbound,
  connectionPax = 0,
  destinationIcao,
  commercial,
  mtowKg,
  departureDateUtc,
  tariff,
}) {
  if (!(paxOutbound > 0)) {
    return { pax: 0, pmr: 0, securityAena: 0, securityAesa: 0 };
  }

  const section = resolveSection({ destinationIcao, commercial, tariff });

  const smallExempt = !commercial && mtowKg < (tariff.pax.exemptIfPrivateAndMtowKgBelow || 0);
  if (smallExempt) {
    return { pax: 0, pmr: 0, securityAena: 0, securityAesa: 0 };
  }

  const connections = Math.min(Math.max(connectionPax, 0), paxOutbound);
  const direct = paxOutbound - connections;

  const isWinterPax = isWinterMonth(tariff.pax.winterMonths || [], departureDateUtc);
  const winterMultPax = isWinterPax ? 1 - (tariff.pax.winterBalearesDiscountPct / 100) : 1;
  const isWinterSec = isWinterMonth(tariff.securityAena.winterMonths || [], departureDateUtc);
  const winterMultSec = isWinterSec ? 1 - (tariff.securityAena.winterBalearesDiscountPct / 100) : 1;

  const paxRate = tariff.pax[section] ?? tariff.pax.international;
  const pmrRate = tariff.pmr[section] ?? tariff.pmr.eee;
  const secAenaRate = tariff.securityAena[section] ?? tariff.securityAena.eee;
  const secAesaRate = tariff.securityAesa[section] ?? tariff.securityAesa.eee;

  const connDiscountPax = 1 - ((tariff.pax.connectionDiscountPct || 0) / 100);
  const connDiscountSecAena = 1 - ((tariff.securityAena.connectionDiscountPct || 0) / 100);
  const connDiscountSecAesa = 1 - ((tariff.securityAesa.connectionDiscountPct || 0) / 100);

  const pax = round2((direct + connections * connDiscountPax) * paxRate * winterMultPax);
  const pmr = round2(paxOutbound * pmrRate);
  const securityAena = round2(
    (direct + connections * connDiscountSecAena) * secAenaRate * winterMultSec,
  );
  const securityAesa = round2(
    (direct + connections * connDiscountSecAesa) * secAesaRate,
  );

  return { pax, pmr, securityAena, securityAesa };
}
