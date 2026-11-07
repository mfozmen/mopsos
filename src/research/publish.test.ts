import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ProbeCoverageError } from './probes.js';
import { prepareRun, pullRequestBody } from './publish.js';

const RUN = '2026-11-07-menemen';

function verdict(id: string, extra: Record<string, string> = {}): string {
  const fields: Record<string, string | undefined> = {
    due_at: '2026-11-30',
    reference_period: '2026-11',
    check_after: '2026-12-16',
    probability: '0.62',
    rule: 'value > 240',
    ...extra,
  };
  return `---
schema_version: 1
id: ${id}
seer: cautious
asset_class: housing
question: 'Will the TCMB house price index for ${fields.reference_period} be above 240?'
probability: ${fields.probability}
created_at: '2026-11-07'
due_at: '${fields.due_at}'
${fields.probe_of ? `calibration_probe_of: ${fields.probe_of}\n` : ''}resolution:
  source: evds
  series: TP.KFE.TR
  reference_period: '${fields.reference_period}'
  check_after: '${fields.check_after}'
  rule: '${fields.rule}'
  print: first
---

Reasoning.
`;
}

function research(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'mopsos-publish-'));
  for (const [path, source] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), source, 'utf8');
  }
  return root;
}

const LONG_ID = '2026-11-07-housing-tr-kfe-2027-09';
const LONG = verdict(LONG_ID, {
  due_at: '2027-09-30',
  reference_period: '2027-09',
  check_after: '2027-10-20',
});

describe('prepareRun', () => {
  it('refuses a name that is not shaped like a run directory before anything uses it', () => {
    // The name ends up in git arguments; "--upload-pack=..." must never get that far.
    const root = research({});

    expect(() => prepareRun(root, '--upload-pack=touch x', ['housing'], [])).toThrow(
      /not a run directory name/,
    );
    expect(() => prepareRun(root, '../2026-11-07-menemen', ['housing'], [])).toThrow(
      /not a run directory name/,
    );
  });

  it('returns the verdicts of the named run only', () => {
    const root = research({
      [`${RUN}/2026-11-07-housing-tr-kfe-nov.md`]: verdict('2026-11-07-housing-tr-kfe-nov'),
      ['2026-11-01-cigli/2026-11-01-housing-tr-kfe-nov.md']: verdict(
        '2026-11-01-housing-tr-kfe-nov',
      ),
    });

    const verdicts = prepareRun(root, RUN, ['housing'], []);

    expect(verdicts.map((entry) => entry.verdict.id)).toEqual(['2026-11-07-housing-tr-kfe-nov']);
  });

  it('refuses a run that is already on main, so a re-run never overwrites it', () => {
    const root = research({
      [`${RUN}/2026-11-07-housing-tr-kfe-nov.md`]: verdict('2026-11-07-housing-tr-kfe-nov'),
    });

    expect(() => prepareRun(root, RUN, ['housing'], [RUN])).toThrow(/already on main/);
  });

  it('refuses a run with no verdicts in it', () => {
    const root = research({
      ['2026-11-01-cigli/2026-11-01-housing-tr-kfe-nov.md']: verdict(
        '2026-11-01-housing-tr-kfe-nov',
      ),
    });

    expect(() => prepareRun(root, RUN, ['housing'], [])).toThrow(/no verdicts/);
  });

  it('refuses an invalid verdict rather than opening a pull request with it', () => {
    const root = research({
      [`${RUN}/2026-11-07-housing-tr-kfe-nov.md`]: verdict('2026-11-07-housing-tr-kfe-nov', {
        rule: 'prices look firm',
      }),
    });

    expect(() => prepareRun(root, RUN, ['housing'], [])).toThrow(/one comparison/);
  });

  it('refuses a long housing verdict without two calibration probes', () => {
    const root = research({ [`${RUN}/${LONG_ID}.md`]: LONG });

    expect(() => prepareRun(root, RUN, ['housing'], [])).toThrow(ProbeCoverageError);
  });

  it('accepts a long housing verdict that carries its two probes', () => {
    const probe = (id: string): string =>
      verdict(id, { due_at: '2026-12-15', check_after: '2026-12-16', probe_of: LONG_ID });
    const root = research({
      [`${RUN}/${LONG_ID}.md`]: LONG,
      [`${RUN}/2026-11-07-housing-probe-a.md`]: probe('2026-11-07-housing-probe-a'),
      [`${RUN}/2026-11-07-housing-probe-b.md`]: probe('2026-11-07-housing-probe-b'),
    });

    expect(prepareRun(root, RUN, ['housing'], [])).toHaveLength(3);
  });
});

describe('pullRequestBody', () => {
  it('shows every verdict with its probability and due date', () => {
    const root = research({
      [`${RUN}/2026-11-07-housing-tr-kfe-nov.md`]: verdict('2026-11-07-housing-tr-kfe-nov', {
        probability: '0.68',
      }),
    });

    const body = pullRequestBody(RUN, prepareRun(root, RUN, ['housing'], []));

    expect(body).toContain('2026-11-07-housing-tr-kfe-nov');
    expect(body).toContain('68%');
    expect(body).toContain('2026-11-30');
    expect(body).toContain('Will the TCMB house price index for 2026-11 be above 240?');
  });
});
