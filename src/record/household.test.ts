import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { DEFAULT_HOUSEHOLD, readHousehold, writeHousehold } from './household.js';

const somewhere = (): string => mkdtempSync(join(tmpdir(), 'mopsos-household-'));

describe('the household the page asks about', () => {
  it('is the page’s own defaults before anyone has answered', () => {
    // A first run, and every clone starts in it.
    expect(readHousehold(somewhere())).toEqual(DEFAULT_HOUSEHOLD);
  });

  it('round-trips what was answered', () => {
    const root = somewhere();
    const mine = { age: 41, owns_home: true, newlywed: false, salary: 'public' as const };

    writeHousehold(root, mine);

    expect(readHousehold(root)).toEqual(mine);
  });

  it('lands beside the rest of the record, not in the repository', () => {
    // The repository is public. These four answers are who the reader is, and
    // they belong where the readings are.
    const root = somewhere();
    writeHousehold(root, DEFAULT_HOUSEHOLD);

    expect(JSON.parse(readFileSync(join(root, 'household.json'), 'utf8'))).toMatchObject({
      schema_version: 1,
    });
  });

  it('falls back to the defaults when the file is unreadable', () => {
    // A page that will not render is worse than a page asking again. This is
    // the one place in the record where that trade is right: nothing is
    // measured here, so nothing is lost by asking.
    const root = somewhere();
    writeFileSync(join(root, 'household.json'), '{ not json', 'utf8');

    expect(readHousehold(root)).toEqual(DEFAULT_HOUSEHOLD);
  });

  it('refuses an answer that is not one of the offered ones', () => {
    // These reach a rate table and a term cap. A salary of "yes" would sit in
    // the file looking like an answer and quietly match no rule at all.
    const root = somewhere();
    writeFileSync(
      join(root, 'household.json'),
      JSON.stringify({
        schema_version: 1,
        age: 35,
        owns_home: false,
        newlywed: false,
        salary: 'astronaut',
      }),
      'utf8',
    );

    expect(readHousehold(root)).toEqual(DEFAULT_HOUSEHOLD);
  });

  it('refuses an age that is not a person’s', () => {
    const root = somewhere();

    for (const age of [0, -3, 200, 'otuz']) {
      writeFileSync(
        join(root, 'household.json'),
        JSON.stringify({
          schema_version: 1,
          age,
          owns_home: false,
          newlywed: false,
          salary: 'private',
        }),
        'utf8',
      );

      expect(readHousehold(root)).toEqual(DEFAULT_HOUSEHOLD);
    }
  });
});
