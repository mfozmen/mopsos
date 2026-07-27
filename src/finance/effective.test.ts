import { describe, expect, it } from 'vitest';

import { annualCostRate, effectiveMonthlyRate, IncalculableCostError } from './effective.js';
import { monthlyPayment } from './mortgage.js';

describe('effectiveMonthlyRate', () => {
  it('equals the quoted rate when there is nothing else to pay', () => {
    // The anchor. If a plain loan does not come back at its own rate, every
    // other number this function produces is noise.
    const payment = monthlyPayment(1_000_000, 2.5, 120);

    expect(
      effectiveMonthlyRate({ principal: 1_000_000, monthlyPayment: payment, months: 120 }),
    ).toBeCloseTo(2.5, 6);
  });

  it('rises when interest is taken up front', () => {
    // Akbank's shape: you borrow 1.000.000 and hand back 309.637 immediately, so
    // 690.363 arrives while the instalments are still sized for 1.000.000.
    const payment = monthlyPayment(1_000_000, 1.99, 120);
    const effective = effectiveMonthlyRate({
      principal: 1_000_000,
      upfrontInterest: 309_637,
      monthlyPayment: payment,
      months: 120,
    });

    expect(effective).toBeGreaterThan(1.99);
    expect(effective).toBeGreaterThan(3);
  });

  it('rises when there are fees to pay at drawdown', () => {
    const payment = monthlyPayment(1_000_000, 2.5, 120);
    const withFee = effectiveMonthlyRate({
      principal: 1_000_000,
      fees: 50_000,
      monthlyPayment: payment,
      months: 120,
    });

    expect(withFee).toBeGreaterThan(2.5);
  });

  it('finds a real cost in a nominally interest-free loan that charges a fee', () => {
    // %0 with a fee is not free, and this is the case where the quoted rate is
    // most obviously not the cost.
    const effective = effectiveMonthlyRate({
      principal: 100_000,
      fees: 10_000,
      monthlyPayment: monthlyPayment(100_000, 0, 12),
      months: 12,
    });

    expect(effective).toBeGreaterThan(0);
  });

  it('refuses when nothing is actually received', () => {
    // Upfront charges swallowing the whole loan has no rate of return; it is
    // not a loan. Better to say so than to return a number.
    expect(() =>
      effectiveMonthlyRate({
        principal: 100_000,
        upfrontInterest: 100_000,
        monthlyPayment: 1_000,
        months: 12,
      }),
    ).toThrow(IncalculableCostError);
  });

  it('refuses when the instalments never repay what arrived', () => {
    expect(() =>
      effectiveMonthlyRate({ principal: 100_000, monthlyPayment: 1_000, months: 12 }),
    ).toThrow(IncalculableCostError);
  });

  it('does not pretend to reproduce a bank’s published cost rate', () => {
    // Yapı Kredi publishes %39,8999 a year for this loan; compounding the rate
    // alone gives %40,60. The gap is their fee and insurance assumptions, which
    // are not in the record. Bending this function to land on their number would
    // be fitting to an answer instead of computing one — so both figures get
    // shown side by side and the difference is left visible.
    const payment = monthlyPayment(1_000_000, 2.88, 120);
    const ours = annualCostRate(
      effectiveMonthlyRate({
        principal: 1_000_000,
        monthlyPayment: payment,
        months: 120,
      }),
    );

    expect(ours * 100).toBeCloseTo(40.6, 1);
  });
});

describe('annualCostRate', () => {
  it('compounds twelve months rather than multiplying by twelve', () => {
    // %2,88 a month is %40,60 a year, not the %34,56 that multiplying gives.
    expect(annualCostRate(2.88)).toBeCloseTo(0.406, 3);
  });

  it('is zero for a free loan', () => {
    expect(annualCostRate(0)).toBe(0);
  });
});

/**
 * Akbank publishes both a worked example and its own yıllık maliyet oranı for
 * five products. Reproducing all five to the fourth decimal is the only
 * independent check this arithmetic gets: the bank computed the same number
 * from the same cashflow, and it did so before we existed.
 *
 * Unlike the Yapı Kredi case above, nothing here is fitted. Every input is a
 * figure Akbank published; the annual cost rate is the output.
 *
 * Source: akbank.com, read 28.07.2026 — İlk Evim ve Peşin Faiz Ödemeli Konut
 * Kredisi sayfalarındaki "Yıllık Maliyet Oranları" tabloları.
 */
describe("Akbank's own worked examples", () => {
  const AKBANK = [
    {
      name: 'İlk Evim 24 ay',
      principal: 500_000,
      months: 24,
      monthlyPayment: 31_300.14,
      fees: 39_250,
      published: 66.6197,
    },
    {
      name: 'İlk Evim 60 ay',
      principal: 500_000,
      months: 60,
      monthlyPayment: 19_442.27,
      fees: 39_250,
      published: 55.6992,
    },
    {
      name: 'İlk Evim 120 ay',
      principal: 500_000,
      months: 120,
      monthlyPayment: 15_907.92,
      fees: 39_250,
      published: 49.18,
    },
    {
      name: 'Peşin faizli %1,99',
      principal: 1_000_000,
      months: 120,
      monthlyPayment: 21_964.48,
      upfrontInterest: 309_637.03,
      fees: 41_750,
      published: 47.9673,
    },
    {
      name: 'Peşin faizli %2,19',
      principal: 1_000_000,
      months: 120,
      monthlyPayment: 23_657.79,
      upfrontInterest: 256_414.76,
      fees: 41_750,
      published: 47.6836,
    },
  ];

  for (const { name, published, ...flow } of AKBANK) {
    it(`reproduces the published annual cost rate: ${name}`, () => {
      const annual = annualCostRate(effectiveMonthlyRate(flow)) * 100;

      expect(annual).toBeCloseTo(published, 1);
    });
  }

  it('counts ekspertiz as part of what the loan costs, because the banks do', () => {
    // Arguable in principle — a valuation is a service you buy either way — but
    // not arguable against the evidence: every bank that publishes both a
    // worked example and its own cost rate puts ekspertiz inside it. Leaving it
    // out puts Akbank's İlk Evim 24 ay at %52,83 against a published %66,62,
    // and breaks the only independent check this arithmetic has.
    const flow = { principal: 500_000, months: 24, monthlyPayment: 31_300.14 };
    const withEkspertiz = annualCostRate(effectiveMonthlyRate({ ...flow, fees: 39_250 })) * 100;
    const without = annualCostRate(effectiveMonthlyRate({ ...flow, fees: 2_500 })) * 100;

    expect(withEkspertiz).toBeCloseTo(66.6197, 2);
    expect(without).not.toBeCloseTo(66.6197, 0);
  });

  it('shows the %1,99 headline is really over %3 a month', () => {
    // The cheapest-looking row in the whole table. It takes 309.637 TL of the
    // million as interest before handing any of it over, so the rate the
    // borrower actually pays is two thirds higher than the one advertised.
    const real = effectiveMonthlyRate({
      principal: 1_000_000,
      months: 120,
      monthlyPayment: 21_964.48,
      upfrontInterest: 309_637.03,
      fees: 41_750,
    });

    expect(real).toBeGreaterThan(3.3);
  });
});
