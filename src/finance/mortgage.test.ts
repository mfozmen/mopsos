import { describe, expect, it } from 'vitest';

import {
  affordability,
  amortisation,
  assertTermAllowed,
  type EnergyClass,
  maxLoan,
  maxLoanToValue,
  maxTermForAge,
  minDownPayment,
  monthlyPayment,
  totalInterest,
  totalRepayment,
} from './mortgage.js';
import { loadMortgageRules } from './rules.js';

const rules = loadMortgageRules();

describe('monthlyPayment', () => {
  // Expected value found independently of the closed form: bisection on a
  // month-by-month simulation for the payment that leaves a zero balance after
  // the last instalment.
  it('1,000,000 TRY at 2.79% per month over 120 months is 28,966.07', () => {
    expect(monthlyPayment(1_000_000, 2.79, 120)).toBeCloseTo(28_966.069813, 4);
  });

  it('1,000,000 TRY at 0% over 120 months is straight division, not NaN', () => {
    expect(monthlyPayment(1_000_000, 0, 120)).toBeCloseTo(8_333.333333, 4);
  });
});

describe('totalRepayment / totalInterest', () => {
  it('repays 120 instalments and charges the rest as interest', () => {
    expect(totalRepayment(1_000_000, 2.79, 120)).toBeCloseTo(28_966.069813 * 120, 4);
    expect(totalInterest(1_000_000, 2.79, 120)).toBeCloseTo(28_966.069813 * 120 - 1_000_000, 4);
  });

  it('charges no interest at a 0% rate', () => {
    expect(totalInterest(1_000_000, 0, 120)).toBeCloseTo(0, 6);
  });
});

describe('amortisation', () => {
  const schedule = amortisation(1_000_000, 2.79, 120);

  it('runs one row per month, numbered from 1', () => {
    expect(schedule).toHaveLength(120);
    expect(schedule[0]?.month).toBe(1);
    expect(schedule[119]?.month).toBe(120);
  });

  it('ends at a zero balance within a cent', () => {
    expect(Math.abs(schedule[119]?.remaining ?? Number.NaN)).toBeLessThan(0.01);
  });

  it('splits every instalment into interest and principal', () => {
    for (const row of schedule) {
      expect(row.interest + row.principal).toBeCloseTo(row.payment, 6);
    }
  });

  it('sums back to the total repayment and the total interest', () => {
    const paid = schedule.reduce((sum, row) => sum + row.payment, 0);
    const interest = schedule.reduce((sum, row) => sum + row.interest, 0);
    const repaidPrincipal = schedule.reduce((sum, row) => sum + row.principal, 0);

    expect(paid).toBeCloseTo(totalRepayment(1_000_000, 2.79, 120), 4);
    expect(interest).toBeCloseTo(totalInterest(1_000_000, 2.79, 120), 4);
    expect(repaidPrincipal).toBeCloseTo(1_000_000, 4);
  });

  it('charges the first month interest on the whole principal', () => {
    expect(schedule[0]?.interest).toBeCloseTo(1_000_000 * 0.0279, 6);
  });

  it('is pure principal at a 0% rate', () => {
    const free = amortisation(120_000, 0, 12);

    expect(free[0]?.interest).toBe(0);
    expect(free[0]?.principal).toBeCloseTo(10_000, 6);
    expect(free[11]?.remaining).toBeCloseTo(0, 6);
  });
});

describe('maxLoanToValue', () => {
  // Both sides of every boundary in the pinned BDDK table. The brackets read
  // "value up to and including", so 5,000,000 is still the first bracket and
  // 5,000,001 is not — an off-by-one here is worth 100,000 TRY of down payment
  // and nothing about the result looks wrong.
  const boundaries: [number, Record<EnergyClass, number>][] = [
    [1, { A_B: 0.9, C: 0.8, OTHER: 0.7 }],
    [5_000_000, { A_B: 0.9, C: 0.8, OTHER: 0.7 }],
    [5_000_001, { A_B: 0.8, C: 0.7, OTHER: 0.6 }],
    [7_000_000, { A_B: 0.8, C: 0.7, OTHER: 0.6 }],
    [7_000_001, { A_B: 0.7, C: 0.6, OTHER: 0.5 }],
    [10_000_000, { A_B: 0.7, C: 0.6, OTHER: 0.5 }],
    [10_000_001, { A_B: 0.5, C: 0.4, OTHER: 0.3 }],
    [20_000_000, { A_B: 0.5, C: 0.4, OTHER: 0.3 }],
    [20_000_001, { A_B: 0.4, C: 0.3, OTHER: 0.2 }],
    [500_000_000, { A_B: 0.4, C: 0.3, OTHER: 0.2 }],
  ];

  for (const [housingValue, expected] of boundaries) {
    for (const energyClass of ['A_B', 'C', 'OTHER'] as const) {
      it(`${housingValue.toLocaleString('en')} TRY, energy class ${energyClass} → ${expected[energyClass]}`, () => {
        expect(maxLoanToValue(rules, housingValue, energyClass)).toBe(expected[energyClass]);
      });
    }
  }
});

describe('maxLoan / minDownPayment', () => {
  it('lends 90% of a 4,000,000 TRY A/B home and leaves 400,000 to find', () => {
    expect(maxLoan(rules, 4_000_000, 'A_B')).toBeCloseTo(3_600_000, 6);
    expect(minDownPayment(rules, 4_000_000, 'A_B')).toBeCloseTo(400_000, 6);
  });

  it('lends 30% of a 25,000,000 TRY unrated home, the top bracket', () => {
    expect(maxLoan(rules, 25_000_000, 'C')).toBeCloseTo(7_500_000, 6);
    expect(minDownPayment(rules, 25_000_000, 'C')).toBeCloseTo(17_500_000, 6);
  });
});

describe('validation', () => {
  it('rejects a zero or negative principal rather than returning a zero payment', () => {
    expect(() => monthlyPayment(0, 2.79, 120)).toThrow(/principal/i);
    expect(() => monthlyPayment(-1, 2.79, 120)).toThrow(/principal/i);
  });

  it('rejects a term shorter than one month', () => {
    expect(() => monthlyPayment(1_000_000, 2.79, 0)).toThrow(/month/i);
    expect(() => monthlyPayment(1_000_000, 2.79, -12)).toThrow(/month/i);
  });

  it('rejects a negative rate, which is a typo rather than a bank paying you', () => {
    expect(() => monthlyPayment(1_000_000, -2.79, 120)).toThrow(/rate/i);
  });

  it('rejects an unknown energy class rather than quietly reading undefined', () => {
    expect(() => maxLoanToValue(rules, 4_000_000, 'A' as unknown as EnergyClass)).toThrow(
      /energy class/i,
    );
    expect(() => maxLoan(rules, 4_000_000, 'D' as unknown as EnergyClass)).toThrow(/energy class/i);
  });

  it('rejects 121 months, one past the pinned BDDK maximum, and allows 120', () => {
    expect(() => assertTermAllowed(rules, 121)).toThrow(/120/);
    expect(() => assertTermAllowed(rules, 120)).not.toThrow();
  });

  it('rejects a term shorter than one month through the same gate', () => {
    expect(() => assertTermAllowed(rules, 0)).toThrow(/month/i);
  });

  // Both arrive the same way: a figure parsed out of a rate sheet or typed into
  // the calculator, where an empty field is NaN and a division by a missing
  // denominator is Infinity. Neither is a number anybody meant, and the annuity
  // formula answers both without complaining — NaN for one, a payment of
  // Infinity for the other — which is a wrong answer that looks like an answer.
  it('refuses a principal that is not a finite number', () => {
    expect(() => monthlyPayment(Number.NaN, 2.79, 120)).toThrow(/principal/i);
    expect(() => monthlyPayment(Number.POSITIVE_INFINITY, 2.79, 120)).toThrow(/principal/i);
  });

  it('refuses a rate that is not a finite number', () => {
    expect(() => monthlyPayment(1_000_000, Number.NaN, 120)).toThrow(/rate/i);
    expect(() => monthlyPayment(1_000_000, Number.POSITIVE_INFINITY, 120)).toThrow(/rate/i);
  });
});

describe('affordability', () => {
  const base = {
    rules,
    monthlyRatePercent: 2.79,
    months: 120,
    energyClass: 'A_B' as EnergyClass,
  };

  // Expected values found independently: the serviceable loan by bisection on a
  // month-by-month simulation, then the highest price by scanning every whole
  // TRY against the LTV table. Neither uses the bracket algebra under test.
  it('is limited by the budget: 30,000/month and 1,000,000 down reaches 2,035,694', () => {
    const price = affordability({ ...base, monthlyBudget: 30_000, downPayment: 1_000_000 });

    expect(price).toBeCloseTo(2_035_694.5279, 2);
    // The loan is well under 90% of the price, so the LTV rule is not binding.
    expect(price - 1_000_000).toBeLessThan(maxLoan(rules, price, 'A_B'));
  });

  it('is limited by the LTV rule: 200,000/month and 400,000 down reaches 4,000,000', () => {
    const price = affordability({ ...base, monthlyBudget: 200_000, downPayment: 400_000 });

    expect(price).toBeCloseTo(4_000_000, 2);
    // 400,000 is exactly the 10% the A/B bracket demands at this price.
    expect(minDownPayment(rules, price, 'A_B')).toBeCloseTo(400_000, 2);
  });

  it('stops at a bracket edge: 1,000,000 down buys 5,000,000, and not one lira more', () => {
    // The circular case. At 5,000,000 the ratio is 0.9 and 1,000,000 is more
    // than the 500,000 needed; one lira higher the ratio drops to 0.8 and the
    // requirement jumps past 1,000,000. The reachable price is the edge itself.
    const price = affordability({ ...base, monthlyBudget: 200_000, downPayment: 1_000_000 });

    expect(price).toBe(5_000_000);
    expect(minDownPayment(rules, 5_000_001, 'A_B')).toBeGreaterThan(1_000_000);
  });

  it('reaches less with a worse energy class, same money', () => {
    const money = { monthlyBudget: 200_000, downPayment: 400_000 };

    expect(affordability({ ...base, ...money, energyClass: 'OTHER' })).toBeLessThan(
      affordability({ ...base, ...money, energyClass: 'A_B' }),
    );
  });

  it('is the down payment alone when there is no budget to service a loan', () => {
    expect(affordability({ ...base, monthlyBudget: 0, downPayment: 1_000_000 })).toBeCloseTo(
      1_000_000,
      6,
    );
  });

  it('services a loan of budget x months at a 0% rate, not NaN', () => {
    // 30,000 for 120 months with no interest is 3,600,000 of loan, and the
    // 400,000 down covers the 10% an A/B home at 4,000,000 needs.
    expect(
      affordability({
        ...base,
        monthlyRatePercent: 0,
        monthlyBudget: 30_000,
        downPayment: 400_000,
      }),
    ).toBeCloseTo(4_000_000, 2);
  });

  it('rejects a term past the pinned maximum', () => {
    expect(() =>
      affordability({ ...base, months: 121, monthlyBudget: 30_000, downPayment: 1_000_000 }),
    ).toThrow(/120/);
  });

  it('rejects a negative monthly budget', () => {
    expect(() => affordability({ ...base, monthlyBudget: -1, downPayment: 1_000_000 })).toThrow(
      /budget/i,
    );
  });

  it('rejects a negative rate', () => {
    expect(() =>
      affordability({ ...base, monthlyRatePercent: -1, monthlyBudget: 30_000, downPayment: 1 }),
    ).toThrow(/rate/i);
  });

  it('rejects a negative down payment', () => {
    expect(() => affordability({ ...base, monthlyBudget: 30_000, downPayment: -1 })).toThrow(
      /down payment/i,
    );
  });

  // An infinite budget or down payment returns an infinite price, which is the
  // one answer this function must never give: the whole point of it is the
  // ceiling, and a ceiling of Infinity reads as "anything is affordable".
  it.each([
    ['monthlyBudget', /budget/i],
    ['monthlyRatePercent', /rate/i],
    ['downPayment', /down payment/i],
  ])('refuses a %s that is not a finite number', (field, message) => {
    const sound = { ...base, monthlyBudget: 30_000, downPayment: 1_000_000 };

    expect(() => affordability({ ...sound, [field]: Number.NaN })).toThrow(message);
    expect(() => affordability({ ...sound, [field]: Number.POSITIVE_INFINITY })).toThrow(message);
  });
});

describe('affordability against a brute-force scan', () => {
  // The bracket algebra is the part most likely to be subtly wrong, so it is
  // checked against the dumbest possible method: try every price in 1,000 TRY
  // steps and keep the highest one the buyer could actually complete. Slow and
  // obviously correct, which is what a cross-check has to be.
  function brute(monthlyBudget: number, downPayment: number, energyClass: EnergyClass): number {
    // The serviceable loan found by bisection on monthlyPayment, so the scan
    // shares no bracket logic with the function it is checking.
    let lo = 1;
    let hi = 1_000_000_000;
    for (let step = 0; step < 200; step += 1) {
      const mid = (lo + hi) / 2;
      if (monthlyPayment(mid, 2.79, 120) < monthlyBudget) lo = mid;
      else hi = mid;
    }
    const serviceable = lo;

    let best = 0;
    for (let price = 1_000; price <= 30_000_000; price += 1_000) {
      const loan = price - downPayment;
      if (loan > serviceable) continue;
      if (loan > maxLoan(rules, price, energyClass)) continue;
      best = price;
    }
    return best;
  }

  for (const energyClass of ['A_B', 'C', 'OTHER'] as const) {
    for (const downPayment of [0, 250_000, 500_000, 1_000_000, 2_000_000, 4_000_000, 9_000_000]) {
      it(`agrees at ${downPayment.toLocaleString('en')} down, energy class ${energyClass}`, () => {
        const exact = affordability({
          rules,
          monthlyBudget: 200_000,
          downPayment,
          monthlyRatePercent: 2.79,
          months: 120,
          energyClass,
        });

        // The scan can only land on a 1,000 TRY grid point, so it is never
        // above the exact answer and never more than a step below it.
        expect(exact).toBeGreaterThanOrEqual(brute(200_000, downPayment, energyClass));
        expect(exact - brute(200_000, downPayment, energyClass)).toBeLessThan(1_000);
      });
    }
  }
});

describe('the reduction for someone who already owns a home', () => {
  // BDDK 10656, kept in force by 11364: if the borrower, their spouse or a child
  // under 18 already owns a home, the ratio is reduced by 75%. It is the single
  // largest effect in the rules, and leaving it out overstates every second-home
  // buyer's borrowing power fourfold.
  const owns = { ...rules, existing_home_reduction: { multiplier: 0.25 } };

  it('leaves a first-time buyer on the full ratio', () => {
    expect(maxLoanToValue(owns, 4000000, 'A_B', { ownsHome: false })).toBe(0.9);
  });

  it('applies a quarter of the ratio to someone who already owns', () => {
    expect(maxLoanToValue(owns, 4000000, 'A_B', { ownsHome: true })).toBeCloseTo(0.225, 10);
  });

  it('reduces every bracket, not only the first', () => {
    expect(maxLoanToValue(owns, 12000000, 'C', { ownsHome: true })).toBeCloseTo(0.1, 10);
  });

  it('treats a missing answer as a first-time buyer, which is the stated goal here', () => {
    expect(maxLoanToValue(owns, 4000000, 'A_B')).toBe(0.9);
  });

  it('carries through to the loan a price allows', () => {
    expect(maxLoan(owns, 4000000, 'A_B', { ownsHome: true })).toBeCloseTo(900000, 6);
  });

  it('carries through to affordability, which is where it changes a decision', () => {
    const first = affordability({
      rules: owns,
      monthlyBudget: 200000,
      downPayment: 1000000,
      monthlyRatePercent: 2.79,
      months: 120,
      energyClass: 'A_B',
      ownsHome: false,
    });
    const second = affordability({
      rules: owns,
      monthlyBudget: 200000,
      downPayment: 1000000,
      monthlyRatePercent: 2.79,
      months: 120,
      energyClass: 'A_B',
      ownsHome: true,
    });

    expect(second).toBeLessThan(first);
  });
});

describe('maxTermForAge', () => {
  // Banks reason from the last instalment, not from drawdown: a 58-year-old can
  // have 12 years of loan, a 68-year-old two.
  it('gives a 40-year-old the full term banks offer', () => {
    expect(maxTermForAge(rules, 40)).toBe(120);
  });

  it('cuts the term so the final instalment lands before the age limit', () => {
    // 62 today, limit 70: eight years of instalments, not ten.
    expect(maxTermForAge(rules, 62)).toBe(96);
  });

  it('is zero, not negative, for someone already past the limit', () => {
    // A negative term would flow into monthlyPayment and produce a number. Zero
    // is refusable; a plausible instalment for an impossible loan is not.
    expect(maxTermForAge(rules, 74)).toBe(0);
  });

  it('does not invent a limit when the record has none', () => {
    // Absent means unrecorded, not "no restriction that we checked". The
    // conventional term still applies; the age rule simply says nothing.
    const silent = { ...rules, term: { conventional_max_months: 120 } };

    expect(maxTermForAge(silent, 62)).toBe(120);
  });

  it('rejects an age that is not a whole number of years', () => {
    expect(() => maxTermForAge(rules, 40.5)).toThrow('whole number');
  });
});
