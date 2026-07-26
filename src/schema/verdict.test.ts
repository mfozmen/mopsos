import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { UnmeasurableVerdictError } from './resolution.js';
import { ValidationError } from './validate.js';
import { parseVerdict } from './verdict.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

function fixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf8');
}

describe('parseVerdict', () => {
  it('returns the verdict and its reasoning', () => {
    const { verdict, reasoning } = parseVerdict(fixture('verdict.valid.md'));

    expect(verdict.id).toBe('2026-07-26-housing-tr-kfe-q3');
    expect(verdict.probability).toBe(0.62);
    expect(reasoning).toContain('seven-week gap');
  });

  it('rejects a verdict with no resolution block, on the schema', () => {
    expect(() => parseVerdict(fixture('verdict.no-resolution.md'))).toThrow(ValidationError);
  });

  it('rejects a rule a human would have to interpret, past the schema', () => {
    // Schema-valid: rule is a non-empty string. Only the semantic gate catches it.
    const source = fixture('verdict.valid.md').replace(
      "rule: 'value > 41.5'",
      "rule: 'meaningfully higher'",
    );

    expect(() => parseVerdict(source)).toThrow(UnmeasurableVerdictError);
  });

  it('refuses a file that is not a verdict at all', () => {
    expect(() => parseVerdict('Gold looks good.')).toThrow(/frontmatter/i);
  });
});
