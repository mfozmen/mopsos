import { parseFrontmatter } from './frontmatter.js';
import { assertMeasurable } from './resolution.js';
import type { Verdict } from './types.js';
import { assertValid } from './validate.js';

export interface ParsedVerdict {
  verdict: Verdict;
  /** The seer's reasoning: everything below the frontmatter. */
  reasoning: string;
}

/**
 * The single gate a verdict passes through before it exists anywhere.
 *
 * Structure first, then meaning. Both throw, so there is no path that stores a
 * verdict nobody can settle — which is the one failure this project cannot
 * absorb, because it is invisible until the day the record is supposed to
 * answer for itself.
 */
export function parseVerdict(source: string): ParsedVerdict {
  const { data, body } = parseFrontmatter(source);

  assertValid('verdict', data);
  const verdict = data as Verdict;
  assertMeasurable(verdict);

  return { verdict, reasoning: body };
}
