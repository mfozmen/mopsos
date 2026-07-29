import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadSavingsFinanceReports } from './load.js';

function report(provider: string, capturedOn: string, fee: number, extra = {}): string {
  return JSON.stringify({
    schema_version: 1,
    provider,
    captured_on: capturedOn,
    source_url: 'https://example.test/konut-tasarruf',
    plans: [
      {
        product: 'Konut 240 ay',
        amount_financed: 3_000_000,
        total_payable: 3_000_000 + fee,
        organisation_fee: fee,
        term_months: 240,
        delivery_after_months: 36,
        delivery_basis: 'contractual',
      },
    ],
    ...extra,
  });
}

function savings(...files: [string, string][]): string {
  const root = mkdtempSync(join(tmpdir(), 'mopsos-savings-'));
  mkdirSync(join(root, 'savings'), { recursive: true });
  for (const [name, body] of files) writeFileSync(join(root, 'savings', name), body, 'utf8');
  return root;
}

describe('loadSavingsFinanceReports', () => {
  it('reads a report', () => {
    const root = savings(['2026-07-29-birevim.json', report('Birevim', '2026-07-29', 270_000)]);

    const [loaded] = loadSavingsFinanceReports(root);

    expect(loaded?.provider).toBe('Birevim');
    expect(loaded?.plans[0]?.delivery_after_months).toBe(36);
  });

  it('is empty before anyone has looked', () => {
    expect(loadSavingsFinanceReports(mkdtempSync(join(tmpdir(), 'mopsos-savings-')))).toEqual([]);
  });

  it('keeps a firm that published nothing, rather than dropping it', () => {
    // "Looked, found nothing" and "nobody looked" are different answers, and
    // only one of them means somebody should go and look again.
    const root = savings([
      'x.json',
      JSON.stringify({
        schema_version: 1,
        provider: 'Bir Şirket',
        captured_on: '2026-07-29',
        source_url: 'https://example.test/x',
        plans: [],
      }),
    ]);

    expect(loadSavingsFinanceReports(root)).toHaveLength(1);
  });

  it('refuses a malformed report by name rather than skipping it', () => {
    // A firm that quietly disappears from the list looks exactly like a firm
    // with nothing on offer, and only one of those needs looking at again.
    const root = savings(['broken.json', JSON.stringify({ schema_version: 1, provider: 'X' })]);

    expect(() => loadSavingsFinanceReports(root)).toThrow(/broken\.json/);
  });

  it('keeps only the newest reading per firm', () => {
    const root = savings(
      ['2026-07-20-birevim.json', report('Birevim', '2026-07-20', 300_000)],
      ['2026-07-29-birevim.json', report('Birevim', '2026-07-29', 270_000)],
    );

    const loaded = loadSavingsFinanceReports(root);

    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.plans[0]?.organisation_fee).toBe(270_000);
  });

  it('does not depend on which file the directory lists first', () => {
    const root = savings(
      ['z-later.json', report('Birevim', '2026-07-29', 270_000)],
      ['a-earlier.json', report('Birevim', '2026-07-20', 300_000)],
    );

    expect(loadSavingsFinanceReports(root)[0]?.plans[0]?.organisation_fee).toBe(270_000);
  });

  it('orders a correction written in the small hours after the reading it corrects', () => {
    // 02:00+03:00 is 23:00 UTC the day before. Compared as text, or filled in as
    // midnight UTC, the correction lands BEFORE the thing it corrects — and the
    // rule that only a later reading may retire an earlier one then quietly
    // refuses it, leaving both readings live under two spellings of the name.
    const root = savings(
      ['a.json', report('Fuzul', '2026-07-29', 300_000)],
      [
        'b.json',
        report('Fuzul Ev', '2026-07-29', 270_000, {
          captured_at: '2026-07-29T02:00:00+03:00',
          supersedes: 'a.json',
        }),
      ],
    );

    expect(loadSavingsFinanceReports(root).map((entry) => entry.provider)).toEqual(['Fuzul Ev']);
  });

  it('ignores a claim to replace something newer than itself', () => {
    // A correction is written after the thing it corrects. Honouring a backwards
    // claim would delete the right reading and keep the wrong one.
    const root = savings(
      [
        'a-late.json',
        report('Bir Şirket', '2026-07-29', 270_000, {
          captured_at: '2026-07-29T10:00:00+03:00',
        }),
      ],
      [
        'b-early.json',
        report('Bir Şirket', '2026-07-29', 900_000, {
          captured_at: '2026-07-29T09:00:00+03:00',
          supersedes: 'a-late.json',
        }),
      ],
    );

    const loaded = loadSavingsFinanceReports(root);

    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.plans[0]?.organisation_fee).toBe(270_000);
  });

  it('ignores a supersedes pointing at a file that is not there', () => {
    // A typo in the field must not make the report itself disappear.
    const root = savings([
      'only.json',
      report('Bir Şirket', '2026-07-29', 270_000, { supersedes: 'never-existed.json' }),
    ]);

    expect(loadSavingsFinanceReports(root).map((entry) => entry.provider)).toEqual(['Bir Şirket']);
  });

  it('lists firms by name rather than ranking them', () => {
    // There is no column to sort on. The firm with the smaller fee is regularly
    // the one with the longer wait, and ordering on either would name a winner
    // the figures do not name.
    const root = savings(
      ['a.json', report('Fuzul', '2026-07-29', 270_000)],
      ['b.json', report('Birevim', '2026-07-29', 300_000)],
    );

    expect(loadSavingsFinanceReports(root).map((entry) => entry.provider)).toEqual([
      'Birevim',
      'Fuzul',
    ]);
  });
});
