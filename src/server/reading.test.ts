import { describe, expect, it } from 'vitest';

import { findReading, readingFile } from './reading.js';

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

describe('finding the reading a request asks for', () => {
  const reading = (file: string, place: string) => ({
    file,
    place,
    dated: '2026-07-29',
    neighbourhoods: [],
    earlier: [],
    corrected: false,
  });

  const live = {
    ...reading('new.json', 'İzmir / Menemen'),
    earlier: [{ ...reading('old.json', 'İzmir / Menemen'), corrected: true }],
  };

  it('finds the current reading of a district', () => {
    expect(findReading([live], 'new.json')?.file).toBe('new.json');
  });

  it('finds one that was superseded', () => {
    // Looking at what was corrected is a thing this record exists to allow, so
    // the endpoint has to be able to hand it over.
    expect(findReading([live], 'old.json')?.corrected).toBe(true);
  });

  it('finds nothing for a file the record does not hold', () => {
    expect(findReading([live], 'nowhere.json')).toBeUndefined();
  });

  it('finds nothing for a walk out of the directory', () => {
    // The allowlist and the lookup are one step, so a caller cannot do the
    // second without the first. The record is on the same disk as .env.
    for (const attempt of ['../.env', '/etc/passwd', 'market/../../.env', '', undefined]) {
      expect(findReading([live], attempt)).toBeUndefined();
    }
  });
});
