import { describe, expect, it } from 'vitest';

import { totalInterest } from '../finance/mortgage.js';
import { borrowingCostRatio, planCost } from './compare.js';
import { type SavingsPlan } from './load.js';

function plan(overrides: Partial<SavingsPlan> = {}): SavingsPlan {
  return {
    product: 'Konut 240 ay',
    amount_financed: 3_000_000,
    total_payable: 3_270_000,
    organisation_fee: 270_000,
    term_months: 240,
    delivery_after_months: 36,
    delivery_basis: 'contractual',
    ...overrides,
  };
}

/** The same plan with no lira fee recorded, as a firm quoting only a percentage leaves it. */
function planWithoutFeeAmount(overrides: Partial<SavingsPlan> = {}): SavingsPlan {
  const value = plan(overrides);
  delete value.organisation_fee;
  return value;
}

describe('what a savings plan costs', () => {
  it('is what the customer pays over what the firm hands over, per lira', () => {
    // Not a rate. There is no rate: the plan charges a fee and no interest, and
    // the money arrives three years after signing rather than at it.
    expect(planCost(plan()).costRatio).toBeCloseTo(0.09, 10);
  });

  it('states the organisation fee on its own, since it is the price of the product', () => {
    expect(planCost(plan()).feeRatio).toBeCloseTo(0.09, 10);
  });

  it('takes the fee from the percentage when that is all the firm published', () => {
    expect(planCost(planWithoutFeeAmount({ organisation_fee_rate: 9 })).feeRatio).toBeCloseTo(
      0.09,
      10,
    );
  });

  it('leaves the fee unknown when neither form was recorded', () => {
    expect(planCost(planWithoutFeeAmount()).feeRatio).toBeUndefined();
  });

  it('lets the total disagree with the fee instead of reconciling them', () => {
    // These firms may charge nothing but the organisation fee, so a total that
    // exceeds it is either a charge the fee line does not cover or a figure
    // copied wrong. Both are worth seeing; neither is worth silently fixing.
    const wider = planCost(plan({ total_payable: 3_400_000 }));

    expect(wider.feeRatio).toBeCloseTo(0.09, 10);
    expect(wider.costRatio).toBeGreaterThan(0.13);
  });

  it('is not moved by the peşinat, which is part of the price and not a charge on top', () => {
    // The trap this pins down. A peşinat is the first slice of the amount being
    // financed, not something paid in addition to it: it is already inside
    // total_payable and already inside amount_financed. Record it as an extra
    // and costRatio picks up the deposit as though the firm had charged it,
    // which is a fifth of the purchase price landing in a column that should
    // only ever hold the organisation fee.
    expect(planCost(plan({ down_payment_ratio: 20, down_payment: 600_000 })).costRatio).toBe(
      planCost(plan()).costRatio,
    );
  });

  it('carries the wait and what kind of wait it is, so a cost cannot be read alone', () => {
    // The fee is not the price. The price is the fee plus three years of paying
    // somebody else's rent, and whether those three years are owed or merely
    // hoped for is the whole risk.
    const indicative = planCost(plan({ delivery_basis: 'indicative' }));

    expect(indicative.monthsWaiting).toBe(36);
    expect(indicative.deliveryBasis).toBe('indicative');
  });
});

describe('what borrowing the same money costs', () => {
  it('is stated per lira too, so the two can be read side by side', () => {
    // The real monthly cost of the cheapest offer in the record, not its
    // headline: Halkbank's %2,60 is really %2,72. Over ten years that is 2,40
    // lira of interest for every lira borrowed — against the plan's 0,09, paid
    // for with three years of waiting.
    expect(borrowingCostRatio(2.72, 120)).toBeCloseTo(2.4, 2);
  });

  it('counts only the part of the price that is actually borrowed', () => {
    // Both sides have to be per lira of the same thing, and the plan's side is
    // per lira of the purchase price. A mortgage buyer putting %20 down borrows
    // only %80 of the price, so the interest they pay is %80 of the per-lira
    // figure. Comparing a plan's cost per lira of house against a loan's cost
    // per lira borrowed overstates the loan by exactly the deposit.
    expect(borrowingCostRatio(2.72, 120, 0.8)).toBeCloseTo(0.8 * borrowingCostRatio(2.72, 120), 10);
  });

  it('scales exactly to any amount, which is what makes it a ratio at all', () => {
    expect(borrowingCostRatio(2.72, 120) * 3_000_000).toBeCloseTo(
      totalInterest(3_000_000, 2.72, 120),
      4,
    );
  });

  it('is nothing at all at a zero rate, which campaign loans do advertise', () => {
    expect(borrowingCostRatio(0, 120)).toBe(0);
  });
});
