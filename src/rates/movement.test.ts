import { describe, expect, it } from 'vitest';

import { type RateExample, type RateReport } from './load.js';
import { moved } from './movement.js';

const AKBANK_EXAMPLE = {
  amount: 1_000_000,
  months: 120,
  instalment: 21_964.48,
  upfront_interest: 309_637.03,
  fees: 41_750,
};

const HALKBANK_EXAMPLE = { amount: 1_000_000, months: 120, instalment: 27_252.33, fees: 36_802 };

function report(monthly_rate: number, example?: RateExample): RateReport {
  return {
    schema_version: 1,
    bank: 'Bir Banka',
    kind: 'faiz',
    captured_on: '2026-07-27',
    source_url: 'https://example.test',
    offers: [{ product: 'Konut', monthly_rate, ...(example === undefined ? {} : { example }) }],
  };
}

function twoOffers(): RateReport {
  return {
    ...report(2.6, HALKBANK_EXAMPLE),
    offers: [
      { product: 'Yeni Evlilere Özel', monthly_rate: 2.6, example: HALKBANK_EXAMPLE },
      { product: 'Peşin Faizli', monthly_rate: 1.99, example: AKBANK_EXAMPLE },
    ],
  };
}

describe('which series the change belongs to', () => {
  it('follows one product where the bank still sells it', () => {
    // A bank's cheapest product changing is not its rate falling. Comparing
    // the best of one reading against the best of another mixes two series and
    // reports a move when nothing was repriced.
    const then = twoOffers();
    const now = {
      ...then,
      offers: [
        { product: 'Yeni Evlilere Özel', monthly_rate: 2.6, example: HALKBANK_EXAMPLE },
        { product: 'Peşin Faizli', monthly_rate: 1.99, example: HALKBANK_EXAMPLE },
      ],
    };

    expect(moved(now, then)?.basis).toBe('offer');
    expect(moved(now, then)?.points).toBe(0);
  });

  it('falls back to the bank when the product it led with is gone', () => {
    const then = {
      ...report(1.99, AKBANK_EXAMPLE),
      offers: [{ product: 'Çekilen Ürün', monthly_rate: 1.99, example: AKBANK_EXAMPLE }],
    };
    const now = {
      ...report(2.6, HALKBANK_EXAMPLE),
      offers: [{ product: 'Yeni Ürün', monthly_rate: 2.6, example: HALKBANK_EXAMPLE }],
    };

    expect(moved(now, then)?.basis).toBe('bank');
  });

  it('names the product it followed, so the reader can see which series it is', () => {
    const then = twoOffers();

    expect(moved(twoOffers(), then)?.product).toBe('Yeni Evlilere Özel');
  });
});

describe('what moved between two readings', () => {
  it('measures the change in what an offer really costs', () => {
    // %3,32 then, %2,72 now: six tenths of a point cheaper to carry.
    const then = report(1.99, AKBANK_EXAMPLE);
    const now = report(2.6, HALKBANK_EXAMPLE);

    expect(moved(now, then)?.points).toBeCloseTo(-0.6, 1);
  });

  it('is silent when the earlier reading had no worked example', () => {
    // Several banks gained an example only because a scout went back for one.
    // A real cost that appeared between two readings is our knowledge changing,
    // not the price — and drawn as a rise it is a lie about the market.
    expect(moved(report(2.6, HALKBANK_EXAMPLE), report(2.6))).toBeUndefined();
  });

  it('is silent when the newer reading has no worked example either', () => {
    expect(moved(report(2.6), report(1.99, AKBANK_EXAMPLE))).toBeUndefined();
  });

  it('says nothing moved when the cost is the same to the basis point', () => {
    const same = report(2.6, HALKBANK_EXAMPLE);

    expect(moved(same, same)?.points).toBe(0);
  });

  it('reads dearer as a rise and cheaper as a fall, not by absolute size', () => {
    const cheap = report(2.6, HALKBANK_EXAMPLE);
    const dear = report(1.99, AKBANK_EXAMPLE);

    expect(moved(dear, cheap)?.points).toBeGreaterThan(0);
    expect(moved(cheap, dear)?.points).toBeLessThan(0);
  });
});
