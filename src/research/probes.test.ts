import { describe, expect, it } from 'vitest';

import type { Verdict } from '../schema/types.js';
import { assertProbeCoverage, ProbeCoverageError } from './probes.js';

const LONG: Verdict = {
  schema_version: 1,
  id: '2026-07-26-housing-tr-kfe-q3',
  seer: 'cautious',
  asset_class: 'housing',
  question: 'Will the TCMB house price index for September 2026 be above 41.5?',
  probability: 0.62,
  created_at: '2026-07-26',
  due_at: '2027-01-31',
  resolution: {
    source: 'evds',
    series: 'TP.KTF17',
    reference_period: '2027-01',
    check_after: '2027-02-16',
    rule: 'value > 41.5',
    print: 'first',
  },
};

function probe(id: string, dueAt: string, target = LONG.id): Verdict {
  return {
    ...LONG,
    id,
    due_at: dueAt,
    calibration_probe_of: target,
    resolution: { ...LONG.resolution, check_after: '2027-03-01' },
  };
}

const PROBES = [
  probe('2026-07-26-housing-rate-4w', '2026-08-23'),
  probe('2026-07-26-housing-listings-6w', '2026-09-06'),
];

function problems(verdicts: Verdict[]): string[] {
  try {
    assertProbeCoverage(verdicts);
  } catch (error) {
    if (error instanceof ProbeCoverageError) return error.problems;
    throw error;
  }
  throw new Error('expected the set to be rejected, but it was accepted');
}

describe('a housing verdict needs calibration probes', () => {
  it('accepts a long-horizon verdict carrying two probes', () => {
    expect(() => {
      assertProbeCoverage([LONG, ...PROBES]);
    }).not.toThrow();
  });

  it('rejects a long-horizon verdict with no probes', () => {
    expect(problems([LONG]).join('\n')).toMatch(/needs at least two calibration probes/);
  });

  it('rejects a long-horizon verdict carrying only one probe', () => {
    expect(problems([LONG, PROBES[0]!]).join('\n')).toMatch(/needs at least two/);
  });

  it('does not demand probes of a short-horizon verdict', () => {
    const short = { ...LONG, id: '2026-07-26-housing-soon', due_at: '2026-08-23' };

    expect(() => {
      assertProbeCoverage([short]);
    }).not.toThrow();
  });

  it('does not demand probes outside housing, which has faster feedback', () => {
    const fx: Verdict = { ...LONG, id: '2026-07-26-fx-long', asset_class: 'fx' };

    expect(() => {
      assertProbeCoverage([fx]);
    }).not.toThrow();
  });
});

describe('a probe must resolve within two to eight weeks', () => {
  it('rejects a probe due in one week, too soon to measure anything', () => {
    const tooSoon = probe('2026-07-26-housing-rate-1w', '2026-08-02');

    expect(problems([LONG, tooSoon, PROBES[1]!]).join('\n')).toMatch(/between 2 and 8 weeks/);
  });

  it('rejects a probe due in twelve weeks, which is not short-horizon feedback', () => {
    const tooLate = probe('2026-07-26-housing-rate-12w', '2026-10-18');

    expect(problems([LONG, tooLate, PROBES[1]!]).join('\n')).toMatch(/between 2 and 8 weeks/);
  });

  it.each(['2026-08-09', '2026-09-20'])('accepts a probe due at %s', (dueAt) => {
    const edge = probe('2026-07-26-housing-rate-edge', dueAt);

    expect(() => {
      assertProbeCoverage([LONG, edge, PROBES[1]!]);
    }).not.toThrow();
  });
});

describe('the relation must point somewhere real', () => {
  it('rejects a probe of a verdict that does not exist', () => {
    const orphan = probe('2026-07-26-housing-orphan', '2026-08-23', '2026-07-26-nothing-here');

    expect(problems([LONG, orphan, ...PROBES]).join('\n')).toMatch(/does not exist/);
  });

  it('rejects a probe of a probe, which calibrates nothing', () => {
    const nested = probe('2026-07-26-housing-nested', '2026-08-23', PROBES[0]!.id);

    expect(problems([LONG, ...PROBES, nested]).join('\n')).toMatch(/is itself a probe/);
  });
});
