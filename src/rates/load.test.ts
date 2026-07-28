import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  bestOffer,
  loadRateReports,
  type RateExample,
  type RateOffer,
  trueMonthlyRate,
} from './load.js';

function report(bank: string, capturedOn: string, monthlyRate: number, extra = {}): string {
  return JSON.stringify({
    schema_version: 1,
    bank,
    captured_on: capturedOn,
    source_url: 'https://example.test/konut-kredisi',
    offers: [{ product: 'Konut Kredisi', monthly_rate: monthlyRate }],
    ...extra,
  });
}

function rates(...files: [string, string][]): string {
  const root = mkdtempSync(join(tmpdir(), 'mopsos-rates-'));
  mkdirSync(join(root, 'rates'), { recursive: true });
  for (const [name, body] of files) writeFileSync(join(root, 'rates', name), body, 'utf8');
  return root;
}

describe('loadRateReports', () => {
  it('reads a report', () => {
    const root = rates(['2026-07-27-ziraat.json', report('Ziraat Bankası', '2026-07-27', 2.79)]);

    const [loaded] = loadRateReports(root);

    expect(loaded?.bank).toBe('Ziraat Bankası');
    expect(loaded?.offers[0]?.monthly_rate).toBe(2.79);
  });

  it('is empty before anyone has looked', () => {
    expect(loadRateReports(mkdtempSync(join(tmpdir(), 'mopsos-rates-')))).toEqual([]);
  });

  it('keeps only the newest reading per bank, since rates move', () => {
    // Older readings are kept on disk — the record is append-only — but showing
    // two rates for one bank invites picking the flattering one.
    const root = rates(
      ['2026-07-20-ziraat.json', report('Ziraat Bankası', '2026-07-20', 3.19)],
      ['2026-07-27-ziraat.json', report('Ziraat Bankası', '2026-07-27', 2.79)],
    );

    const loaded = loadRateReports(root);

    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.offers[0]?.monthly_rate).toBe(2.79);
  });

  it('sorts by the cheapest offer, which is the question being asked', () => {
    const root = rates(
      ['a-vakif.json', report('VakıfBank', '2026-07-27', 3.05)],
      ['b-ziraat.json', report('Ziraat Bankası', '2026-07-27', 2.79)],
    );

    expect(loadRateReports(root).map((entry) => entry.bank)).toEqual([
      'Ziraat Bankası',
      'VakıfBank',
    ]);
  });

  it('keeps a bank that published nothing, rather than dropping it', () => {
    // "Looked, found nothing" and "never looked" are different answers, and only
    // one of them means someone should go and look.
    const root = rates([
      'x.json',
      JSON.stringify({
        schema_version: 1,
        bank: 'Bir Banka',
        captured_on: '2026-07-27',
        source_url: 'https://example.test/x',
        offers: [],
      }),
    ]);

    expect(loadRateReports(root)).toHaveLength(1);
  });

  it('refuses a malformed report rather than skipping it', () => {
    const root = rates(['broken.json', JSON.stringify({ schema_version: 1, bank: 'X' })]);

    expect(() => loadRateReports(root)).toThrow(/broken\.json/);
  });

  it('marks a participation bank as selling a profit share, not interest', () => {
    const root = rates(['k.json', report('Kuveyt Türk', '2026-07-27', 2.95, { kind: 'kar_payi' })]);

    expect(loadRateReports(root)[0]?.kind).toBe('kar_payi');
  });

  it('treats an unmarked bank as conventional, which is the common case', () => {
    const root = rates(['z.json', report('Ziraat Bankası', '2026-07-27', 2.79)]);

    expect(loadRateReports(root)[0]?.kind).toBe('faiz');
  });
});

describe('bestOffer', () => {
  it('finds the cheapest rate in a report', () => {
    expect(
      bestOffer({
        schema_version: 1,
        bank: 'X',
        kind: 'faiz',
        captured_on: '2026-07-27',
        source_url: 'https://example.test/x',
        offers: [
          { product: 'Standart', monthly_rate: 3.1 },
          { product: 'Kampanya', monthly_rate: 2.69 },
        ],
      })?.monthly_rate,
    ).toBe(2.69);
  });

  it('returns nothing when the bank published nothing', () => {
    expect(
      bestOffer({
        schema_version: 1,
        bank: 'X',
        kind: 'faiz',
        captured_on: '2026-07-27',
        source_url: 'https://example.test/x',
        offers: [],
      }),
    ).toBeUndefined();
  });
});

describe('a second reading on the same day', () => {
  function at(bank: string, capturedAt: string, rate: number): string {
    return JSON.stringify({
      schema_version: 1,
      bank,
      captured_on: capturedAt.slice(0, 10),
      captured_at: capturedAt,
      source_url: 'https://example.test/x',
      offers: [{ product: 'Konut', monthly_rate: rate }],
    });
  }

  it('supersedes the earlier one, so a correction is possible at all', () => {
    // Append-only means the record is never silently improved. It does not mean
    // a mistake has to stand: the earlier file stays on disk, and the later
    // reading is what gets shown.
    const root = rates(
      ['a.json', at('Yapı Kredi', '2026-07-28T09:00:00Z', 2.88)],
      ['b.json', at('Yapı Kredi', '2026-07-28T15:00:00Z', 3.12)],
    );

    expect(loadRateReports(root)[0]?.offers[0]?.monthly_rate).toBe(3.12);
  });

  it('does not depend on which file the directory lists first', () => {
    const root = rates(
      ['z-later.json', at('Yapı Kredi', '2026-07-28T15:00:00Z', 3.12)],
      ['a-earlier.json', at('Yapı Kredi', '2026-07-28T09:00:00Z', 2.88)],
    );

    expect(loadRateReports(root)[0]?.offers[0]?.monthly_rate).toBe(3.12);
  });

  it('still works when only the date is recorded, as older reports have it', () => {
    const root = rates(
      ['old.json', report('Yapı Kredi', '2026-07-20', 2.5)],
      ['new.json', at('Yapı Kredi', '2026-07-28T09:00:00Z', 2.88)],
    );

    expect(loadRateReports(root)[0]?.offers[0]?.monthly_rate).toBe(2.88);
  });
});

describe('what a rate really costs', () => {
  const withExample = (extra: object) =>
    JSON.stringify({
      schema_version: 1,
      bank: 'Bir Banka',
      captured_on: '2026-07-28',
      source_url: 'https://example.test/x',
      offers: [
        {
          product: 'Konut',
          monthly_rate: 1.99,
          example: { amount: 1000000, months: 120, instalment: 21964, ...extra },
        },
      ],
    });

  it('is the quoted rate when the example carries no extra charge', () => {
    const root = rates(['a.json', withExample({})]);

    expect(trueMonthlyRate(loadRateReports(root)[0]!.offers[0]!)).toBeCloseTo(1.99, 1);
  });

  it('is far above the quoted rate when interest is taken up front', () => {
    // Akbank's shape: %1,99 quoted, 309.637 TL never arrives.
    const root = rates(['a.json', withExample({ upfront_interest: 309637 })]);

    expect(trueMonthlyRate(loadRateReports(root)[0]!.offers[0]!)).toBeCloseTo(3.1, 1);
  });

  it('is unknown when the bank published no example', () => {
    // Not "equal to the quoted rate". Most of these are package rates whose
    // insurance cost is unpublished, so the real cost is unknown and higher —
    // and showing the quoted rate as though it were the cost is the exact
    // mistake this column exists to correct.
    const root = rates(['a.json', report('Bir Banka', '2026-07-28', 2.88)]);

    expect(trueMonthlyRate(loadRateReports(root)[0]!.offers[0]!)).toBeUndefined();
  });
});

describe("the bank's own cost rate as a checksum", () => {
  const offer = (example: RateExample): RateOffer => ({
    product: 'Konut',
    monthly_rate: 3.19,
    example,
  });

  it('is unknown when our arithmetic cannot reproduce what the bank published', () => {
    // Ziraat: 1.000.000 TL / 120 ay, taksit 32.654,09, its own yıllık maliyet
    // oranı %47,2938. From the instalment alone we get %45,76 — the gap is fees
    // the scout did not record. The example is incomplete, and the honest answer
    // is that we do not know, not a rate we can see is understated.
    expect(
      trueMonthlyRate(
        offer({
          amount: 1_000_000,
          months: 120,
          instalment: 32_654.09,
          published_annual_cost_rate: 47.2938,
        }),
      ),
    ).toBeUndefined();
  });

  it('accepts the example when the two agree', () => {
    // Halkbank Yeni Evlilere Özel, fees included: reproduces %37,9263 exactly.
    expect(
      trueMonthlyRate(
        offer({
          amount: 1_000_000,
          months: 120,
          instalment: 27_252.33,
          fees: 36_802,
          published_annual_cost_rate: 37.9263,
        }),
      ),
    ).toBeCloseTo(2.72, 2);
  });

  it('still answers when our figure comes out above what the bank published', () => {
    // Yapı Kredi: 1.000.000 TL / 120 ay, taksit 29.786,99, fees 31.802 which the
    // bank itself nets out of the drawdown. We get %42,35 a year; the bank prints
    // %41,6431 — and the implied fee behind its formula drifts between 19.173 and
    // 24.684 TL while its own printed fee is 31.802 at every term. Its formula
    // does not reconcile with its own cashflow.
    //
    // The check is one-sided on purpose. Below the published figure means our
    // example is short of a charge, and understating a cost is the failure this
    // exists to prevent. Above it means we are the conservative one, and
    // suppressing the offer would hide a real number in favour of nothing.
    expect(
      trueMonthlyRate(
        offer({
          amount: 1_000_000,
          months: 120,
          instalment: 29_786.99,
          fees: 31_802,
          published_annual_cost_rate: 41.6431,
        }),
      ),
    ).toBeCloseTo(2.99, 2);
  });

  it('refuses a figure wildly above the published one, which is our error not theirs', () => {
    // The one-sided rule reads "above" as the bank's formula not reconciling —
    // which it was, by 0,7 points. It is not a licence for any gap at all: a fee
    // entered twice, or a decimal point moved, lands far outside anything a
    // formula disagreement produces, and it lands on the safe-looking side where
    // nothing else would question it.
    expect(
      trueMonthlyRate(
        offer({
          amount: 1_000_000,
          months: 120,
          instalment: 29_786.99,
          fees: 318_020,
          published_annual_cost_rate: 41.6431,
        }),
      ),
    ).toBeUndefined();
  });

  it('still answers when the bank published no cost rate to check against', () => {
    // No checksum is not a failed checksum. The example is all there is, and it
    // is still better than the headline.
    expect(
      trueMonthlyRate(offer({ amount: 1_000_000, months: 120, instalment: 27_252.33 })),
    ).toBeCloseTo(2.6, 1);
  });
});

describe('supersedes', () => {
  it('drops the reading a later one replaces, even under a different spelling', () => {
    // A scout wrote "VakifBank", the correction wrote "VakıfBank", and because
    // newest-per-bank keys on the name both survived — two live rates for one
    // bank, which is exactly the invitation to pick the flattering one that
    // keying by name exists to prevent. The field says which file is dead; the
    // spelling is not what makes it dead.
    const root = rates(
      ['a-vakif.json', report('VakifBank', '2026-07-28', 2.95)],
      ['b-vakif.json', report('VakıfBank', '2026-07-28', 3.29, { supersedes: 'a-vakif.json' })],
    );

    const banks = loadRateReports(root).map((r) => r.bank);

    expect(banks).toEqual(['VakıfBank']);
  });

  it('ignores a claim to replace something newer than itself', () => {
    // Otherwise a stale file deletes the correct one. A correction is written
    // after the thing it corrects; a file claiming to replace a later reading
    // has its history backwards, and honouring it would make the bank vanish
    // while leaving the wrong reading in place.
    const root = rates(
      [
        'a-late.json',
        report('Bir Banka', '2026-07-28', 2.95, { captured_at: '2026-07-28T10:00:00+03:00' }),
      ],
      [
        'b-early.json',
        report('Bir Banka', '2026-07-28', 9.99, {
          captured_at: '2026-07-28T09:00:00+03:00',
          supersedes: 'a-late.json',
        }),
      ],
    );

    const loaded = loadRateReports(root);

    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.offers[0]?.monthly_rate).toBe(2.95);
  });

  it('ignores a supersedes pointing at a file that is not there', () => {
    // A typo in the field must not make the report itself disappear: a bank that
    // silently vanishes looks the same as a bank nobody checked.
    const root = rates([
      'only.json',
      report('Bir Banka', '2026-07-28', 2.95, { supersedes: 'never-existed.json' }),
    ]);

    expect(loadRateReports(root).map((r) => r.bank)).toEqual(['Bir Banka']);
  });
});
