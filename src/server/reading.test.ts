import { describe, expect, it } from 'vitest';

import { readingFile } from './reading.js';

describe('which file a request may ask for', () => {
  const known = ['2026-07-29-izmir-menemen.json', '2026-07-28-izmir-cigli.json'];

  it('allows a file the record actually holds', () => {
    expect(readingFile('2026-07-29-izmir-menemen.json', known)).toBe(
      '2026-07-29-izmir-menemen.json',
    );
  });

  it('refuses one it does not', () => {
    // An allowlist rather than a sanitiser. The set of readable files is known
    // exactly — the loader just read them — so there is no reason to reason
    // about what a path could mean.
    expect(readingFile('2026-01-01-nowhere.json', known)).toBeUndefined();
  });

  it('refuses a walk out of the directory', () => {
    for (const attempt of [
      '../.env',
      '../../.env',
      '..%2f.env',
      '/etc/passwd',
      'market/../../.env',
    ]) {
      expect(readingFile(attempt, known)).toBeUndefined();
    }
  });

  it('refuses nothing at all', () => {
    expect(readingFile(undefined, known)).toBeUndefined();
    expect(readingFile('', known)).toBeUndefined();
  });
});
