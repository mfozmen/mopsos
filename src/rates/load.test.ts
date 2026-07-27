import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { bestOffer, loadRateReports } from './load.js';

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
