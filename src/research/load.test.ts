import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { loadVerdicts } from './load.js';

const VERDICT = `---
schema_version: 1
id: 2026-07-26-housing-tr-kfe-q3
seer: cautious
asset_class: housing
question: 'Will the TCMB house price index for September 2026 be above 41.5?'
probability: 0.62
created_at: '2026-07-26'
due_at: '2026-09-30'
resolution:
  source: evds
  series: TP.KTF17
  reference_period: '2026-09'
  check_after: '2026-10-16'
  rule: 'value > 41.5'
  print: first
---

Reasoning goes here.
`;

let root: string;

function research(): string {
  root = mkdtempSync(join(tmpdir(), 'mopsos-'));
  return root;
}

function writeVerdict(dir: string, filename: string, source = VERDICT): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, filename), source, 'utf8');
}

afterEach(() => {
  root = '';
});

describe('loadVerdicts', () => {
  it('loads a verdict from a run directory', () => {
    const dir = research();
    writeVerdict(join(dir, '2026-07-26-menemen'), '2026-07-26-housing-tr-kfe-q3.md');

    const loaded = loadVerdicts(dir);

    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.verdict.id).toBe('2026-07-26-housing-tr-kfe-q3');
    expect(loaded[0]?.run).toBe('2026-07-26-menemen');
  });

  it('finds verdicts across several runs', () => {
    const dir = research();
    writeVerdict(join(dir, '2026-07-26-menemen'), '2026-07-26-housing-tr-kfe-q3.md');
    writeVerdict(
      join(dir, '2026-08-02-bornova'),
      '2026-08-02-housing-rate.md',
      VERDICT.replace('2026-07-26-housing-tr-kfe-q3', '2026-08-02-housing-rate'),
    );

    expect(loadVerdicts(dir).map((entry) => entry.verdict.id)).toEqual([
      '2026-07-26-housing-tr-kfe-q3',
      '2026-08-02-housing-rate',
    ]);
  });

  it('returns nothing when there is no research directory yet', () => {
    expect(loadVerdicts(join(tmpdir(), 'mopsos-does-not-exist'))).toEqual([]);
  });

  it('ignores files that are not verdicts', () => {
    const dir = research();
    const run = join(dir, '2026-07-26-menemen');
    writeVerdict(run, '2026-07-26-housing-tr-kfe-q3.md');
    writeFileSync(join(run, '2026-07-26-housing-tr-kfe-q3.evidence.json'), '{}', 'utf8');
    writeFileSync(join(run, 'notes.txt'), 'scratch', 'utf8');

    expect(loadVerdicts(dir)).toHaveLength(1);
  });

  it('ignores outcomes/, which holds outcome files rather than verdicts', () => {
    const dir = research();
    writeVerdict(join(dir, '2026-07-26-menemen'), '2026-07-26-housing-tr-kfe-q3.md');
    mkdirSync(join(dir, 'outcomes'), { recursive: true });
    writeFileSync(
      join(dir, 'outcomes', '2026-10-16-outcome-housing-tr-kfe-q3.md'),
      '---\nschema_version: 1\nverdict_id: 2026-07-26-housing-tr-kfe-q3\n---\n\nRead.\n',
      'utf8',
    );

    expect(loadVerdicts(dir).map((entry) => entry.verdict.id)).toEqual([
      '2026-07-26-housing-tr-kfe-q3',
    ]);
  });

  it('ignores a directory that is not named like a run', () => {
    const dir = research();
    writeVerdict(join(dir, '2026-07-26-menemen'), '2026-07-26-housing-tr-kfe-q3.md');
    mkdirSync(join(dir, 'scratch'), { recursive: true });
    writeFileSync(join(dir, 'scratch', 'draft.md'), 'not a verdict', 'utf8');

    expect(loadVerdicts(dir)).toHaveLength(1);
  });

  it('refuses a filename that disagrees with the id inside it', () => {
    const dir = research();
    writeVerdict(join(dir, '2026-07-26-menemen'), '2026-07-26-something-else.md');

    expect(() => loadVerdicts(dir)).toThrow(/filename.*id/i);
  });

  it('refuses two verdicts sharing an id', () => {
    const dir = research();
    writeVerdict(join(dir, '2026-07-26-menemen'), '2026-07-26-housing-tr-kfe-q3.md');
    writeVerdict(join(dir, '2026-08-02-bornova'), '2026-07-26-housing-tr-kfe-q3.md');

    expect(() => loadVerdicts(dir)).toThrow(/duplicate/i);
  });

  it('refuses an unmeasurable verdict rather than skipping it', () => {
    const dir = research();
    writeVerdict(
      join(dir, '2026-07-26-menemen'),
      '2026-07-26-housing-tr-kfe-q3.md',
      VERDICT.replace("rule: 'value > 41.5'", "rule: 'meaningfully higher'"),
    );

    // Skipping would be worse than failing: a verdict that quietly disappears
    // from the record is indistinguishable from one that was never made.
    expect(() => loadVerdicts(dir)).toThrow(/2026-07-26-housing-tr-kfe-q3\.md/);
  });
});
