import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import type { Verdict } from '../schema/types.js';
import { parseVerdict } from '../schema/verdict.js';

export interface LoadedVerdict {
  /** The run directory this verdict was produced in, relative to the research root. */
  run: string;
  /** Path to the file, so an error can name something the reader can open. */
  path: string;
  verdict: Verdict;
  reasoning: string;
}

/**
 * Reads every verdict under a research root.
 *
 * Refuses rather than skips. A malformed verdict that quietly disappears from
 * the record is indistinguishable from one that was never made, and a track
 * record with silent holes in it is not a track record.
 */
export function loadVerdicts(root: string): LoadedVerdict[] {
  if (!existsSync(root)) return [];

  const loaded: LoadedVerdict[] = [];
  const seen = new Map<string, string>();

  for (const run of readdirSync(root, { withFileTypes: true })) {
    if (!run.isDirectory()) continue;

    const runPath = join(root, run.name);
    const files = readdirSync(runPath).filter(
      (file) => file.endsWith('.md') && !file.endsWith('.evidence.md'),
    );

    for (const file of files.sort()) {
      const path = join(runPath, file);
      let parsed;
      try {
        parsed = parseVerdict(readFileSync(path, 'utf8'));
      } catch (error) {
        throw new Error(`${path}: ${error instanceof Error ? error.message : String(error)}`, {
          cause: error,
        });
      }

      const stem = basename(file, '.md');
      if (stem !== parsed.verdict.id) {
        throw new Error(`${path}: filename does not match the verdict id (${parsed.verdict.id})`);
      }

      const previous = seen.get(parsed.verdict.id);
      if (previous) {
        throw new Error(`${path}: duplicate verdict id, already used by ${previous}`);
      }
      seen.set(parsed.verdict.id, path);

      loaded.push({ run: run.name, path, verdict: parsed.verdict, reasoning: parsed.reasoning });
    }
  }

  return loaded;
}
