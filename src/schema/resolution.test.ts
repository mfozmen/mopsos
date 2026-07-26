import { describe, expect, it } from 'vitest';

import { assertMeasurable, UnmeasurableVerdictError } from './resolution.js';
import type { Verdict } from './types.js';

const VERDICT: Verdict = {
  schema_version: 1,
  id: '2026-07-26-housing-tr-kfe-q3',
  seer: 'cautious',
  asset_class: 'housing',
  question: 'Will the TCMB house price index for September 2026 be above 41.5?',
  probability: 0.62,
  created_at: '2026-07-26',
  due_at: '2026-09-30',
  resolution: {
    source: 'evds',
    series: 'TP.KTF17',
    reference_period: '2026-09',
    check_after: '2026-10-16',
    rule: 'value > 41.5',
    print: 'first',
  },
};

function verdict(overrides: Partial<Verdict>): Verdict {
  return { ...VERDICT, ...overrides };
}

function withRule(rule: string): Verdict {
  return verdict({ resolution: { ...VERDICT.resolution, rule } });
}

function problems(input: Verdict): string[] {
  try {
    assertMeasurable(input);
  } catch (error) {
    if (error instanceof UnmeasurableVerdictError) return error.problems;
    throw error;
  }
  throw new Error('expected the verdict to be rejected, but it was accepted');
}

describe('a rule must be one comparison', () => {
  it.each(['value > 41.5', 'value < 38.2', 'value >= 0', 'value <= -1.75'])(
    'accepts %s',
    (rule) => {
      expect(() => {
        assertMeasurable(withRule(rule));
      }).not.toThrow();
    },
  );

  it.each([
    'meaningfully higher',
    'value > 41.5 and rising',
    'above last quarter',
    'value > 41.5 or value < 20',
    'value',
    '> 41.5',
  ])('rejects %s, which needs a human to decide', (rule) => {
    expect(problems(withRule(rule)).join('\n')).toMatch(/one comparison/);
  });
});

describe('a print must be the first one', () => {
  it('rejects a revised print, which would let a settled result change later', () => {
    const input = verdict({
      resolution: { ...VERDICT.resolution, print: 'latest' as 'first' },
    });

    expect(problems(input).join('\n')).toMatch(/print must be "first"/);
  });
});

describe('check_after must be after the value exists', () => {
  it('rejects a date inside the reference period', () => {
    const input = verdict({
      resolution: { ...VERDICT.resolution, check_after: '2026-09-20' },
    });

    expect(problems(input).join('\n')).toMatch(/before the end of reference_period/);
  });

  it('rejects a date before the verdict even comes due', () => {
    const input = verdict({
      due_at: '2026-11-30',
      resolution: { ...VERDICT.resolution, reference_period: '2026-09' },
    });

    expect(problems(input).join('\n')).toMatch(/before due_at/);
  });

  it('accepts the day the period ends, since the floor is what the schema can know', () => {
    const input = verdict({
      due_at: '2026-09-30',
      resolution: { ...VERDICT.resolution, check_after: '2026-09-30' },
    });

    expect(() => {
      assertMeasurable(input);
    }).not.toThrow();
  });

  it('handles a weekly reference period, which ends on a Sunday', () => {
    // 2026-W36 runs Mon 31 August to Sun 6 September.
    const input = verdict({
      due_at: '2026-09-06',
      resolution: {
        ...VERDICT.resolution,
        reference_period: '2026-W36',
        check_after: '2026-09-05',
      },
    });

    expect(problems(input).join('\n')).toMatch(/2026-09-06/);
  });

  it('handles a daily reference period', () => {
    const input = verdict({
      due_at: '2026-09-15',
      resolution: {
        ...VERDICT.resolution,
        reference_period: '2026-09-15',
        check_after: '2026-09-14',
      },
    });

    expect(problems(input).join('\n')).toMatch(/before the end of reference_period/);
  });
});

describe('an unrecognised reference period is an error, not an assumption', () => {
  it('rejects a period it cannot parse rather than guessing an end date', () => {
    const input = verdict({
      resolution: { ...VERDICT.resolution, reference_period: 'Q3' },
    });

    expect(problems(input).join('\n')).toMatch(/Unrecognised reference period: Q3/);
  });
});

describe('dates must run forwards', () => {
  it('rejects a verdict that comes due before it was written', () => {
    expect(problems(verdict({ due_at: '2026-07-01' })).join('\n')).toMatch(/must be after/);
  });

  it('rejects a verdict due on the day it was written', () => {
    expect(problems(verdict({ due_at: '2026-07-26' })).join('\n')).toMatch(/must be after/);
  });
});

describe('a probe points at another verdict', () => {
  it('rejects a verdict that is its own calibration probe', () => {
    const input = verdict({ calibration_probe_of: VERDICT.id });

    expect(problems(input).join('\n')).toMatch(/its own calibration probe/);
  });
});

describe('reporting', () => {
  it('reports every problem at once rather than one per attempt', () => {
    const input = verdict({
      due_at: '2026-07-01',
      resolution: { ...VERDICT.resolution, rule: 'looks good', check_after: '2026-08-01' },
    });

    expect(problems(input).length).toBeGreaterThanOrEqual(3);
  });
});
