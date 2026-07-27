import { readFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';

import { fetchPdf } from './fetch.js';

export class OutsideAllowedRootError extends Error {
  constructor(target: string, roots: string[]) {
    super(
      `"${target}" is outside every directory this tool may read.\n\n` +
        `Allowed:\n${roots.map((root) => `  ${root}`).join('\n')}\n\n` +
        `Move the file into one of them, or pass a URL.`,
    );
    this.name = 'OutsideAllowedRootError';
  }
}

function isInside(root: string, candidate: string): boolean {
  const difference = relative(root, candidate);
  return difference !== '' && !difference.startsWith('..') && !isAbsolute(difference);
}

/**
 * Resolves a local path, refusing anything outside the allowed roots.
 *
 * The caller is usually a subagent building a path out of a request, so
 * "read any file on the machine" is a capability this tool would have by
 * accident rather than by design. Reading PDFs needs no such reach.
 */
function resolveLocal(target: string, roots: string[]): string {
  const candidates = isAbsolute(target)
    ? [resolve(target)]
    : roots.map((root) => resolve(join(root, target)));

  for (const candidate of candidates) {
    if (roots.some((root) => isInside(resolve(root), candidate))) return candidate;
  }

  throw new OutsideAllowedRootError(target, roots);
}

/** Reads a PDF from a URL or from a path inside one of the allowed roots. */
export async function readPdf(target: string, roots: string[]): Promise<Uint8Array> {
  if (/^https?:\/\//.test(target)) return fetchPdf(target);

  return new Uint8Array(readFileSync(resolveLocal(target, roots)));
}
