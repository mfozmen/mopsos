import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseFrontmatter } from './frontmatter.js';
import { assertValid, ValidationError } from './validate.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

function markdown(name: string): unknown {
  return parseFrontmatter(readFileSync(join(FIXTURES, name), 'utf8')).data;
}

function json(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));
}

/** The valid verdict, with one field changed — so each test isolates one reason. */
function verdictWith(overrides: Record<string, unknown>): unknown {
  return { ...(markdown('verdict.valid.md') as object), ...overrides };
}

function problems(kind: 'verdict' | 'evidence' | 'outcome' | 'score', data: unknown): string[] {
  try {
    assertValid(kind, data);
  } catch (error) {
    if (error instanceof ValidationError) return error.problems;
    throw error;
  }
  throw new Error('expected validation to fail, but it passed');
}

describe('accepted documents', () => {
  it('accepts a complete verdict', () => {
    expect(() => {
      assertValid('verdict', markdown('verdict.valid.md'));
    }).not.toThrow();
  });

  it('accepts a calibration probe pointing at another verdict', () => {
    expect(() => {
      assertValid('verdict', markdown('verdict.probe.md'));
    }).not.toThrow();
  });

  it('accepts evidence, outcome and score', () => {
    expect(() => {
      assertValid('evidence', json('evidence.valid.json'));
      assertValid('outcome', markdown('outcome.valid.md'));
      assertValid('score', json('score.valid.json'));
    }).not.toThrow();
  });
});

describe('the measurability rule', () => {
  it('rejects a verdict with no resolution block at all', () => {
    expect(problems('verdict', markdown('verdict.no-resolution.md'))).toContain(
      "/ must have required property 'resolution'",
    );
  });

  it.each(['source', 'series', 'reference_period', 'check_after', 'rule', 'print'])(
    'rejects a resolution block missing %s',
    (field) => {
      const valid = markdown('verdict.valid.md') as { resolution: Record<string, unknown> };
      const resolution = { ...valid.resolution };
      delete resolution[field];

      expect(problems('verdict', verdictWith({ resolution }))).toContain(
        `/resolution must have required property '${field}'`,
      );
    },
  );

  it('rejects a revised print, because a revision would rewrite history', () => {
    const valid = markdown('verdict.valid.md') as { resolution: Record<string, unknown> };
    const resolution = { ...valid.resolution, print: 'latest' };

    expect(problems('verdict', verdictWith({ resolution }))).toContain(
      '/resolution/print must be equal to constant',
    );
  });

  it('rejects a source that was not fixed at prediction time', () => {
    const valid = markdown('verdict.valid.md') as { resolution: Record<string, unknown> };
    const resolution = { ...valid.resolution, source: 'whatever-looks-best' };

    expect(problems('verdict', verdictWith({ resolution }))).toContain(
      '/resolution/source must be equal to one of the allowed values',
    );
  });
});

describe('probability', () => {
  it.each([0, 1])('rejects %s, which claims certainty rather than predicting', (probability) => {
    expect(problems('verdict', verdictWith({ probability }))).not.toHaveLength(0);
  });

  it.each([-0.1, 1.5])('rejects %s, which is not a probability at all', (probability) => {
    expect(problems('verdict', verdictWith({ probability }))).not.toHaveLength(0);
  });

  it.each([0.01, 0.5, 0.99])('accepts %s', (probability) => {
    expect(() => {
      assertValid('verdict', verdictWith({ probability }));
    }).not.toThrow();
  });
});

describe('structure', () => {
  it('rejects an unknown field rather than silently ignoring it', () => {
    expect(problems('verdict', verdictWith({ confidence: 'high' }))).toContain(
      '/ must NOT have additional properties',
    );
  });

  it('rejects evidence citing no sources', () => {
    const valid = json('evidence.valid.json') as object;

    expect(problems('evidence', { ...valid, sources: [] })).toContain(
      '/sources must NOT have fewer than 1 items',
    );
  });

  it('rejects an outcome term that is not 0 or 1', () => {
    const valid = json('score.valid.json') as object;

    expect(problems('score', { ...valid, outcome: 0.5 })).not.toHaveLength(0);
  });

  it('reports every problem at once rather than one per attempt', () => {
    expect(problems('verdict', verdictWith({ probability: 2, seer: 'Not A Slug' }))).toHaveLength(
      2,
    );
  });
});

describe('frontmatter parsing', () => {
  it('keeps the reasoning body alongside the data', () => {
    const document = parseFrontmatter(readFileSync(join(FIXTURES, 'verdict.valid.md'), 'utf8'));

    expect(document.body).toContain('seven-week gap');
  });

  it('refuses a file with no frontmatter instead of returning an empty document', () => {
    expect(() => parseFrontmatter('Gold looks good.')).toThrow(/frontmatter/i);
  });

  it('refuses frontmatter that is not a mapping', () => {
    expect(() => parseFrontmatter('---\n- one\n- two\n---\nbody')).toThrow(/mapping/i);
  });
});
