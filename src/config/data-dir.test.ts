import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveDataDir } from './data-dir.js';

/** A code repository at <root>/mopsos, so the sibling path is <root>/mopsos-data. */
function workspace(): { root: string; code: string } {
  const root = mkdtempSync(join(tmpdir(), 'mopsos-ws-'));
  const code = join(root, 'mopsos');
  mkdirSync(code, { recursive: true });
  return { root, code };
}

describe('resolveDataDir', () => {
  it('uses MOPSOS_DATA_DIR when it is set', () => {
    const { root, code } = workspace();
    const chosen = join(root, 'somewhere-else');
    mkdirSync(chosen);

    expect(resolveDataDir(code, { MOPSOS_DATA_DIR: chosen })).toBe(chosen);
  });

  it('refuses a MOPSOS_DATA_DIR that does not exist instead of falling back', () => {
    // Falling back would silently write research into a different place than the
    // one that was asked for, and nobody would notice until the history was split.
    const { root, code } = workspace();
    mkdirSync(join(root, 'mopsos-data'));

    expect(() => resolveDataDir(code, { MOPSOS_DATA_DIR: join(root, 'typo') })).toThrow(
      /MOPSOS_DATA_DIR/,
    );
  });

  it('finds the private repository beside the code repository', () => {
    const { root, code } = workspace();
    const sibling = join(root, 'mopsos-data');
    mkdirSync(sibling);

    expect(resolveDataDir(code, {})).toBe(sibling);
  });

  it('falls back to private/ when there is no sibling repository', () => {
    const { code } = workspace();
    const fallback = join(code, 'private');
    mkdirSync(fallback);

    expect(resolveDataDir(code, {})).toBe(fallback);
  });

  it('prefers the sibling repository, which is the one that keeps history', () => {
    const { root, code } = workspace();
    const sibling = join(root, 'mopsos-data');
    mkdirSync(sibling);
    mkdirSync(join(code, 'private'));

    expect(resolveDataDir(code, {})).toBe(sibling);
  });

  it('says how to set itself up rather than returning nothing', () => {
    const { code } = workspace();

    expect(() => resolveDataDir(code, {})).toThrow(/gh repo create/);
  });
});
