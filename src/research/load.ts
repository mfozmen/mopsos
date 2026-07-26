import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { parseFrontmatter } from '../schema/frontmatter.js';
import type { Outcome, Verdict } from '../schema/types.js';
import { assertValid } from '../schema/validate.js';
import { parseVerdict, type ParsedVerdict } from '../schema/verdict.js';

/**
 * Run directories are `YYYY-MM-DD-<slug>`. Matching on the shape rather than
 * skipping a list of known exceptions means `outcomes/`, scratch folders and
 * anything else added later are ignored by default instead of being parsed as
 * verdicts and blowing up.
 */
const RUN_DIRECTORY = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Deliberately not `localeCompare`: the record must read identically on every
 * machine, and locale-aware collation is exactly the thing that would make it
 * not. Code point order is arbitrary but it is the same everywhere.
 */
function byCodePoint(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

export interface LoadedVerdict {
  /** The run directory this verdict was produced in, relative to the research root. */
  run: string;
  /** Path to the file, so an error can name something the reader can open. */
  path: string;
  verdict: Verdict;
  reasoning: string;
}

function runDirectories(root: string): string[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && RUN_DIRECTORY.test(entry.name))
    .map((entry) => entry.name)
    .sort(byCodePoint);
}

function verdictFiles(runPath: string): string[] {
  return readdirSync(runPath)
    .filter((file) => file.endsWith('.md'))
    .sort(byCodePoint);
}

function parseFile(path: string): ParsedVerdict {
  try {
    return parseVerdict(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`${path}: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }
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

  for (const run of runDirectories(root)) {
    for (const file of verdictFiles(join(root, run))) {
      const path = join(root, run, file);
      const { verdict, reasoning } = parseFile(path);

      if (basename(file, '.md') !== verdict.id) {
        throw new Error(`${path}: filename does not match the verdict id (${verdict.id})`);
      }

      const previous = seen.get(verdict.id);
      if (previous) {
        throw new Error(`${path}: duplicate verdict id, already used by ${previous}`);
      }
      seen.set(verdict.id, path);

      loaded.push({ run, path, verdict, reasoning });
    }
  }

  return loaded;
}

/**
 * The ids of verdicts that already have an outcome.
 *
 * Refuses a malformed outcome rather than ignoring it. Ignoring it would report
 * the verdict as still due and invite a second, conflicting measurement of
 * something already settled — and the second measurement is the one that would
 * be taken with the answer already visible.
 */
export function loadResolvedVerdictIds(root: string): Set<string> {
  const outcomes = join(root, 'outcomes');
  if (!existsSync(outcomes)) return new Set();

  const ids = new Set<string>();

  for (const file of readdirSync(outcomes).filter((name) => name.endsWith('.md'))) {
    const path = join(outcomes, file);
    const { data } = parseFrontmatter(readFileSync(path, 'utf8'));

    try {
      assertValid('outcome', data);
    } catch (error) {
      throw new Error(`${path}: ${error instanceof Error ? error.message : String(error)}`, {
        cause: error,
      });
    }

    ids.add((data as Outcome).verdict_id);
  }

  return ids;
}
