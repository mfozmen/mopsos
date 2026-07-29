import { totalInterest } from '../finance/mortgage.js';
import { type DeliveryBasis, type SavingsPlan } from './load.js';

/**
 * Why there is no implied monthly rate here, and will not be.
 *
 * `src/finance/effective.ts` solves a cashflow for the rate that prices it, and
 * a savings plan is a cashflow, so the arithmetic is available. It is not used,
 * for two reasons that no amount of care in the calculation would fix.
 *
 * **The money arrives at month N, not at signing.** An internal rate of return
 * over that cashflow answers a different question from a loan's rate, and it
 * answers it flatteringly: the plan comes out cheap precisely because the buyer
 * spent N months without the house. Those months have a price — rent, and the
 * house moving while you wait — which is real, is larger than the organisation
 * fee, and appears nowhere in the plan's own figures. A number that omits the
 * dominant cost of the product and lands in the same column as a mortgage rate
 * is not a comparison, it is a recommendation with the working hidden.
 *
 * **For most of these plans N is not promised.** Where `delivery_basis` is
 * `indicative` the date depends on the group filling or the queue moving. A rate
 * computed to four decimals on a date the sözleşme does not owe you is precision
 * resting on a hope, and precision is exactly what makes it persuasive.
 *
 * So both sides are stated the same honest way instead: **extra lira paid per
 * lira received**, with the wait printed beside it and never folded into it. The
 * plan's figure and the loan's figure are then the same kind of thing, the
 * reader can see which is bigger, and nothing has decided for them what three
 * years of waiting is worth.
 *
 * What this deliberately does not do: discount for inflation. Over a 240-month
 * plan that term dominates both sides and it cuts the plan's way. It is not
 * modelled here because doing it would need an inflation path nobody in this
 * record has measured — and a guessed path is the same mistake as a guessed
 * delivery date, in a bigger coat.
 */
export interface PlanCost {
  product: string;
  /**
   * Everything paid over and above the amount financed, per lira financed —
   * from the firm's own total, not a sum of the parts.
   */
  costRatio: number;
  /**
   * The organisation fee per lira financed. These firms may charge nothing else,
   * so where this and `costRatio` disagree the gap is either a charge the fee
   * line does not cover or a figure copied wrong. It is left showing rather than
   * reconciled: both are worth seeing and neither is worth silently fixing.
   *
   * Unknown when the firm published the fee in neither form.
   */
  feeRatio?: number;
  /** Teslimat süresi. The other half of the price, and the half with no lira sign. */
  monthsWaiting: number;
  /** Whether those months are owed or merely expected. Travels with the cost on purpose. */
  deliveryBasis: DeliveryBasis;
}

/** What one plan costs, on the only basis it shares with a loan. */
export function planCost(plan: SavingsPlan): PlanCost {
  // Rate first, then the lira amount: a firm that publishes a percentage is
  // stating the price of the product, while a lira fee is that percentage
  // already applied to one particular amount_financed. Where both are recorded
  // they agree, and where they do not the percentage is the one the firm sells.
  const feeRatio =
    plan.organisation_fee_rate === undefined
      ? plan.organisation_fee === undefined
        ? undefined
        : plan.organisation_fee / plan.amount_financed
      : plan.organisation_fee_rate / 100;

  return {
    product: plan.product,
    costRatio: (plan.total_payable - plan.amount_financed) / plan.amount_financed,
    ...(feeRatio === undefined ? {} : { feeRatio }),
    monthsWaiting: plan.delivery_after_months,
    deliveryBasis: plan.delivery_basis,
  };
}

/**
 * What borrowing costs on the same basis: extra lira per lira borrowed.
 *
 * `monthlyRatePercent` must be the **real** monthly cost of the offer, the one
 * `trueMonthlyRate` works out from the bank's own example — not the headline.
 * Akbank's %1,99 is really %3,32, and feeding the headline in here would compare
 * a savings plan against a loan that does not exist.
 *
 * Per lira and therefore independent of the amount, which is the whole point:
 * the two products are rarely quoted for the same sum, and a comparison that
 * needs them to be would never be made.
 */
export function borrowingCostRatio(monthlyRatePercent: number, months: number): number {
  return totalInterest(1, monthlyRatePercent, months);
}
