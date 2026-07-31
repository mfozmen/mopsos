import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadMarketReports } from './load.js';

function neighbourhood(extra: Record<string, unknown> = {}) {
  return {
    name: 'Egekent 2',
    sale_per_m2: 48_000,
    rent_per_m2: 180,
    listing_count: 62,
    basis: 'listing_median',
    confidence: 'medium',
    source: 'İlan sitesi araması, 3+1 daireler',
    source_url: 'https://example.test/egekent-2',
    ...extra,
  };
}

function report(extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    schema_version: 1,
    province: 'İzmir',
    district: 'Çiğli',
    captured_on: '2026-07-28',
    neighbourhoods: [neighbourhood()],
    ...extra,
  });
}

function market(...files: [string, string][]): string {
  const root = mkdtempSync(join(tmpdir(), 'mopsos-market-'));
  mkdirSync(join(root, 'market'), { recursive: true });
  for (const [name, body] of files) writeFileSync(join(root, 'market', name), body, 'utf8');
  return root;
}

describe('loadMarketReports', () => {
  it('reads a report', () => {
    const [loaded] = loadMarketReports(market(['a.json', report()]));

    expect(loaded?.place).toBe('İzmir / Çiğli');
    expect(loaded?.neighbourhoods[0]?.sale_per_m2).toBe(48_000);
  });

  it('returns nothing when no research has been done', () => {
    expect(loadMarketReports(mkdtempSync(join(tmpdir(), 'mopsos-empty-')))).toEqual([]);
  });

  it('works out the yield itself rather than trusting the agent with arithmetic', () => {
    // 180 × 12 / 48.000 = 4,5%. Derived here so it cannot disagree with the two
    // numbers it comes from — an agent that reports all three can report a yield
    // that does not follow from its own figures, and nothing would catch it.
    const [loaded] = loadMarketReports(market(['a.json', report()]));

    expect(loaded?.neighbourhoods[0]?.gross_yield).toBeCloseTo(0.045, 4);
  });

  it('refuses a figure with no source', () => {
    // The rule the whole record rests on: a number nobody can go and check is
    // not evidence, and it is worse than a gap because it looks like evidence.
    const bad = report({ neighbourhoods: [neighbourhood({ source: undefined })] });

    expect(() => loadMarketReports(market(['a.json', bad]))).toThrow(/source/i);
  });

  it('refuses a malformed report rather than skipping it', () => {
    // A neighbourhood that quietly disappears looks the same as one nobody
    // researched, and only one of those means somebody should go and look.
    expect(() => loadMarketReports(market(['a.json', '{"schema_version":1}']))).toThrow(/a\.json/);
  });

  it('keeps the newest reading per district and leaves the old one on disk', () => {
    const root = market(
      ['2026-06-01-izmir-cigli.json', report({ captured_on: '2026-06-01' })],
      ['2026-07-28-izmir-cigli.json', report({ captured_on: '2026-07-28' })],
    );

    const loaded = loadMarketReports(root);

    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.dated).toBe('2026-07-28');
  });

  it('separates districts that share a province', () => {
    const root = market(
      ['a.json', report({ district: 'Çiğli' })],
      ['b.json', report({ district: 'Karşıyaka' })],
    );

    expect(loadMarketReports(root).map((r) => r.place)).toEqual([
      'İzmir / Karşıyaka',
      'İzmir / Çiğli',
    ]);
  });
});

describe('the readings behind a district', () => {
  it('carries the earlier readings rather than dropping them', () => {
    const root = market(
      ['2026-07-20-cigli.json', report({ captured_on: '2026-07-20' })],
      ['2026-07-28-cigli.json', report({ captured_on: '2026-07-28' })],
    );

    const [shown] = loadMarketReports(root);

    expect(shown?.dated).toBe('2026-07-28');
    expect(shown?.earlier.map((reading) => reading.dated)).toEqual(['2026-07-20']);
  });

  it('marks a replaced reading as corrected, not as a second observation', () => {
    // The rates side already refuses to count a correction as an earlier
    // reading, because that says the price was once something else when it
    // never was. Nothing in the market record uses supersedes yet, and the
    // first one that does must not read as a district that moved.
    const root = market(
      ['2026-07-20-cigli.json', report({ captured_on: '2026-07-20' })],
      [
        '2026-07-28-cigli.json',
        report({ captured_on: '2026-07-28', supersedes: '2026-07-20-cigli.json' }),
      ],
    );

    expect(loadMarketReports(root)[0]?.earlier[0]?.corrected).toBe(true);
  });

  it('ignores a claim that points at another district', () => {
    // supersedes is filled in by hand, so a pasted filename from the run next
    // to it is an ordinary mistake. Honoured across districts it relabels a
    // genuine reading of an unrelated place as a correction, quietly, and the
    // reader has no way to see it happened.
    const root = market(
      ['2026-07-20-cigli.json', report({ captured_on: '2026-07-20' })],
      ['2026-07-28-cigli.json', report({ captured_on: '2026-07-28' })],
      [
        '2026-07-28-menemen.json',
        report({
          district: 'Menemen',
          captured_on: '2026-07-28',
          supersedes: '2026-07-20-cigli.json',
        }),
      ],
    );

    const cigli = loadMarketReports(root).find((place) => place.place.endsWith('Çiğli'));

    expect(cigli?.earlier[0]?.corrected).toBe(false);
  });

  it('leaves a genuine earlier reading unmarked', () => {
    const root = market(
      ['2026-07-20-cigli.json', report({ captured_on: '2026-07-20' })],
      ['2026-07-28-cigli.json', report({ captured_on: '2026-07-28' })],
    );

    expect(loadMarketReports(root)[0]?.earlier[0]?.corrected).toBe(false);
  });

  it('puts the most recent of several earlier readings first', () => {
    const root = market(
      ['2026-07-13-cigli.json', report({ captured_on: '2026-07-13' })],
      ['2026-07-20-cigli.json', report({ captured_on: '2026-07-20' })],
      ['2026-07-28-cigli.json', report({ captured_on: '2026-07-28' })],
    );

    expect(loadMarketReports(root)[0]?.earlier.map((reading) => reading.dated)).toEqual([
      '2026-07-20',
      '2026-07-13',
    ]);
  });

  it('has nothing behind a district looked at once', () => {
    expect(loadMarketReports(market(['a.json', report()]))[0]?.earlier).toEqual([]);
  });

  it('carries the time when two readings share a day, or they cannot be told apart', () => {
    // The record holds exactly this: two readings of Menemen hours apart on one
    // date, the second saying in its own note that it is not a direction
    // reading. Shown by date alone they are the same reading twice.
    const root = market(
      [
        '2026-07-29-a.json',
        report({ captured_on: '2026-07-29', captured_at: '2026-07-29T09:15:00+03:00' }),
      ],
      [
        '2026-07-29-b.json',
        report({ captured_on: '2026-07-29', captured_at: '2026-07-29T18:40:00+03:00' }),
      ],
    );

    const [shown] = loadMarketReports(root);

    expect(shown?.at).toBe('2026-07-29T18:40:00+03:00');
    expect(shown?.earlier[0]?.at).toBe('2026-07-29T09:15:00+03:00');
  });

  it('leaves the earlier reading its own figures, not the newest ones', () => {
    const root = market(
      [
        '2026-07-20-cigli.json',
        report({
          captured_on: '2026-07-20',
          neighbourhoods: [neighbourhood({ sale_per_m2: 40_000 })],
        }),
      ],
      ['2026-07-28-cigli.json', report({ captured_on: '2026-07-28' })],
    );

    expect(loadMarketReports(root)[0]?.earlier[0]?.neighbourhoods[0]?.sale_per_m2).toBe(40_000);
  });
});
