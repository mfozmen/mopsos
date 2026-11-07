/**
 * A seer is one file in plugin/agents/: its own three sections, then the shared
 * rules copied verbatim from plugin/seers/skeleton.md.
 *
 * Copied rather than referenced, as the scout briefs are: an agent's file is its
 * whole system prompt, and a rule it has to remember to go and read is a rule
 * one seer skips. Copies drift, though, and seers that follow different rules
 * are not being compared fairly — which is the one thing this project measures.
 * So this is what holds the copies together.
 */

/** The only sections a seer writes for itself. */
export const OWN_SECTIONS = ['Area', 'Disposition', 'Priors'] as const;

const AGENT_NAME = /^name: seer-[a-z0-9]+(-[a-z0-9]+)*$/m;

interface Section {
  heading: string;
  text: string;
}

function body(source: string): string {
  const match = /^---\n[\s\S]*?\n---\n/.exec(source);
  return match ? source.slice(match[0].length) : source;
}

/** Splits on `## ` headings. The text before the first one is returned separately. */
function sections(markdown: string): { preamble: string; sections: Section[] } {
  const parts = markdown.split(/^(?=## )/m);
  const preamble = parts[0]?.startsWith('## ') ? '' : (parts.shift() ?? '');
  return {
    preamble,
    sections: parts.map((part) => ({
      heading: part.slice(3, part.indexOf('\n')).trim(),
      text: part.trim(),
    })),
  };
}

/** Every way `source` departs from the seer format. Empty when it conforms. */
export function seerProblems(source: string, skeleton: string): string[] {
  const problems: string[] = [];
  const normalised = source.replaceAll('\r\n', '\n');

  if (!AGENT_NAME.test(normalised)) {
    problems.push('the agent name must be seer-<name>, so seers are told apart from scouts');
  }

  const seer = sections(body(normalised));
  if (seer.preamble.trim() !== '') {
    problems.push('text before the first section: a seer declares only Area, Disposition, Priors');
  }

  const own: readonly string[] = OWN_SECTIONS;
  for (const heading of OWN_SECTIONS) {
    if (!seer.sections.some((section) => section.heading === heading)) {
      problems.push(`missing its own section: ## ${heading}`);
    }
  }

  const shared = new Map(
    sections(skeleton.replaceAll('\r\n', '\n')).sections.map((s) => [s.heading, s.text]),
  );
  const present = new Set<string>();

  for (const section of seer.sections) {
    if (own.includes(section.heading)) continue;
    present.add(section.heading);

    const expected = shared.get(section.heading);
    if (expected === undefined) {
      problems.push(
        `## ${section.heading} is neither one of ${OWN_SECTIONS.join(', ')} ` +
          'nor a shared section: rules belong in the skeleton, for every seer',
      );
    } else if (section.text !== expected) {
      problems.push(`## ${section.heading} differs from plugin/seers/skeleton.md`);
    }
  }

  for (const heading of shared.keys()) {
    if (!present.has(heading)) problems.push(`missing shared section: ## ${heading}`);
  }

  return problems;
}
