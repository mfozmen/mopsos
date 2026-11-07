import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { seerProblems } from './seers.js';

const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), '../../plugin');
const SKELETON = readFileSync(join(PLUGIN, 'seers/skeleton.md'), 'utf8');

const FRONTMATTER = `---
name: seer-cautious
description: A housing seer that expects prices to lag inflation.
tools: Bash, Read, Write, WebFetch, WebSearch
---
`;

const OWN = `## Area

Housing in Türkiye.

## Disposition

Cautious.

## Priors

Real house prices fall while policy rates stay high.
`;

function seer(own = OWN, shared = SKELETON): string {
  return `${FRONTMATTER}\n${own}\n${shared}`;
}

describe('seerProblems', () => {
  it('accepts a seer that declares its own three sections and carries the skeleton verbatim', () => {
    expect(seerProblems(seer(), SKELETON)).toEqual([]);
  });

  it('rejects a seer whose shared rules drifted from the skeleton', () => {
    const drifted = SKELETON.replace('strictly between 0 and 1', 'between 0 and 1');

    expect(seerProblems(seer(OWN, drifted), SKELETON).join('\n')).toMatch(
      /differs from plugin\/seers\/skeleton\.md/,
    );
  });

  it('rejects a seer missing a shared section', () => {
    const shorter = SKELETON.slice(0, SKELETON.indexOf('## Calibration probes'));

    expect(seerProblems(seer(OWN, shorter), SKELETON).join('\n')).toMatch(/Calibration probes/);
  });

  it('rejects a seer that leaves out its disposition', () => {
    const own = OWN.replace('## Disposition\n\nCautious.\n\n', '');

    expect(seerProblems(seer(own), SKELETON).join('\n')).toMatch(/Disposition/);
  });

  it('rejects a seer that adds rules of its own outside the three sections', () => {
    const own = `${OWN}\n## Extra rules\n\nRound probabilities to 0.05.\n`;

    expect(seerProblems(seer(own), SKELETON).join('\n')).toMatch(/Extra rules/);
  });

  it('rejects a seer whose agent name is not seer-<name>', () => {
    const renamed = seer().replace('name: seer-cautious', 'name: cautious');

    expect(seerProblems(renamed, SKELETON).join('\n')).toMatch(/seer-/);
  });
});

describe('the seers in plugin/agents', () => {
  const seers = readdirSync(join(PLUGIN, 'agents')).filter((name) => name.startsWith('seer-'));

  // A loop rather than it.each: there are no seers yet (#25, #26), and an empty
  // suite fails. Each seer's problems are keyed by its file name.
  it('all follow the skeleton', () => {
    const problems = Object.fromEntries(
      seers.map((name) => [
        name,
        seerProblems(readFileSync(join(PLUGIN, 'agents', name), 'utf8'), SKELETON),
      ]),
    );

    expect(problems).toEqual(Object.fromEntries(seers.map((name) => [name, []])));
  });
});
