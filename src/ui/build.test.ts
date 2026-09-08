import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { compileCalculator, findDataDir, readPageData } from './build.js';

describe('gathering what the page is made of', () => {
  it('reads the record when there is one', () => {
    const root = mkdtempSync(join(tmpdir(), 'mopsos-build-'));
    mkdirSync(join(root, 'market'), { recursive: true });
    writeFileSync(
      join(root, 'market', 'a.json'),
      JSON.stringify({
        schema_version: 1,
        province: 'İzmir',
        district: 'Çiğli',
        captured_on: '2026-07-28',
        neighbourhoods: [
          {
            name: 'Egekent 2',
            sale_per_m2: 48_000,
            listing_count: 12,
            basis: 'listing_median',
            confidence: 'medium',
            source: 'emlakjet, 3+1, medyan',
          },
        ],
      }),
      'utf8',
    );

    const data = readPageData(root, 'BUNDLE');

    expect(data.research[0]?.place).toBe('İzmir / Çiğli');
    expect(data.finance.bundle).toBe('BUNDLE');
  });

  it('builds a page with empty tabs when no research has been done', () => {
    // The state before anything has been researched, which every clone starts
    // in. A page whose tabs say what they will hold is more use than a crash.
    const data = readPageData(undefined, '');

    expect(data.research).toEqual([]);
    expect(data.rates).toEqual([]);
    expect(data.savings).toEqual([]);
    expect(data.modules.map((module) => module.id)).toContain('housing');
  });

  it('validates the mortgage rules rather than trusting them', () => {
    // The page applies these to real money. A half-edited bracket table returns
    // a plausible wrong ratio in silence, so it is validated on the way in —
    // this asks that the validated object arrived, not that it is any shape.
    expect(readPageData(undefined, '').finance.rules.loan_to_value.brackets.length).toBeGreaterThan(
      0,
    );
  });

  it('finds the directory the environment points at', () => {
    const root = mkdtempSync(join(tmpdir(), 'mopsos-env-'));
    const was = process.env['MOPSOS_DATA_DIR'];
    process.env['MOPSOS_DATA_DIR'] = root;

    try {
      expect(findDataDir()).toBe(root);
    } finally {
      if (was === undefined) delete process.env['MOPSOS_DATA_DIR'];
      else process.env['MOPSOS_DATA_DIR'] = was;
    }
  });

  it('says nothing rather than throwing when there is no directory at all', () => {
    // Warned about, not fatal: the page still has a map and a calculator, and
    // saying so beats a stack trace on a fresh clone.
    const was = process.env['MOPSOS_DATA_DIR'];
    process.env['MOPSOS_DATA_DIR'] = join(tmpdir(), 'mopsos-does-not-exist-ever');

    try {
      expect(findDataDir()).toBeUndefined();
    } finally {
      if (was === undefined) delete process.env['MOPSOS_DATA_DIR'];
      else process.env['MOPSOS_DATA_DIR'] = was;
    }
  });

  it('compiles the calculator the browser runs', async () => {
    // The same module the tests run against, so the arithmetic on the page and
    // the arithmetic under test cannot disagree.
    const bundle = await compileCalculator();

    expect(bundle).toContain('Mortgage');
    expect(bundle.length).toBeGreaterThan(100);
  });
});
