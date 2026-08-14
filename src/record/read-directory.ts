import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { byCodePoint } from '../order.js';
import { assertValid, type DocumentKind } from '../schema/validate.js';

/**
 * Every report in one directory of the record, in filename order, validated.
 *
 * The three loaders that read this record opened with the same twelve lines,
 * and the part that differs comes after: which reading wins, and what a
 * correction means for the one it replaces. Reading is not where they differ,
 * so it is not where they should each have a copy.
 *
 * A malformed file stops the load rather than being skipped, and the error
 * names the path. A report that quietly disappears looks exactly like one
 * nobody has written yet, and only one of those means somebody should go and
 * look.
 *
 * Filename order, not reading order. What each loader does with the timestamps
 * is its own business — this only guarantees the sequence is the same one
 * every time, so a load does not depend on how the filesystem felt.
 */
export function readReports<T>(
  root: string,
  directoryName: string,
  schema: DocumentKind,
): { report: T; file: string }[] {
  const directory = join(root, directoryName);
  if (!existsSync(directory)) return [];

  return readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .sort(byCodePoint)
    .map((file) => {
      const path = join(directory, file);
      const data: unknown = JSON.parse(readFileSync(path, 'utf8'));

      try {
        assertValid(schema, data);
      } catch (error) {
        throw new Error(`${path}: ${error instanceof Error ? error.message : String(error)}`, {
          cause: error,
        });
      }

      return { report: data as T, file };
    });
}
