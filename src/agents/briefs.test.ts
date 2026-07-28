import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const AGENTS = join(dirname(fileURLToPath(import.meta.url)), '../../plugin/agents');

function section(brief: string, heading: string): string {
  const start = brief.indexOf(`## ${heading}`);
  if (start === -1) return '';

  const next = brief.indexOf('\n## ', start + 1);
  return brief.slice(start, next === -1 ? undefined : next).trim();
}

/**
 * A brief is an agent's system prompt, so guidance that has to reach every
 * scout has to be *in* every scout's file. Extracting it to a document they
 * reference would make it a tool call each one has to remember to make, and one
 * that skips it loses the guidance with nothing to show that it did.
 *
 * So the text is duplicated on purpose, and this is what stops the copies
 * drifting: edit one and the build says so.
 */
describe('the scout briefs', () => {
  const scouts = ['rate-scout.md', 'market-scout.md'].map((name) => ({
    name,
    brief: readFileSync(join(AGENTS, name), 'utf8'),
  }));

  it('all warn about the shared browser in exactly the same words', () => {
    const heading = 'The shared browser, and when not to use it';
    const [first, ...rest] = scouts.map((scout) => section(scout.brief, heading));

    expect(first).toContain('npm run read:page');
    for (const other of rest) expect(other).toBe(first);
  });
});
