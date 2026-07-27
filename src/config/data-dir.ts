import { existsSync } from 'node:fs';
import { join } from 'node:path';

const SETUP = `Set one up with:

  gh repo create mfozmen/mopsos-data --private --clone

Clone it beside this repository, not inside it. Or set MOPSOS_DATA_DIR to an
existing directory, or create private/ here — that works with no setup but keeps
no history, so reports cannot be compared against earlier ones.`;

/**
 * Where research data lives: outside this repository, because this one is public.
 *
 * Resolution order is environment variable, then the private repository beside
 * this one, then `private/` as a no-setup fallback.
 *
 * Throws rather than returning a default. A tool that silently picks a different
 * directory than the one intended splits the history in two, and the split is
 * only discovered months later when a comparison comes back empty.
 */
export function resolveDataDir(codeRoot: string, env: Record<string, string | undefined>): string {
  const configured = env['MOPSOS_DATA_DIR'];
  if (configured !== undefined && configured.length > 0) {
    if (!existsSync(configured)) {
      throw new Error(
        `MOPSOS_DATA_DIR points at "${configured}", which does not exist.\n\n` +
          `Not falling back to another directory on purpose: writing research somewhere ` +
          `other than where you asked would split the history without telling you.`,
      );
    }
    return configured;
  }

  // The sibling repository first — it is the one that keeps history and backups.
  const sibling = join(codeRoot, '..', 'mopsos-data');
  if (existsSync(sibling)) return sibling;

  const fallback = join(codeRoot, 'private');
  if (existsSync(fallback)) return fallback;

  throw new Error(`No data directory found.\n\n${SETUP}`);
}
