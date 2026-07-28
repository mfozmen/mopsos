import { describe, expect, it } from 'vitest';

import { readAt } from './read-at.js';

describe('readAt', () => {
  it('understands an offset, which is how every reading in the record is written', () => {
    // Compared as text, 01:58+03:00 sorts after 09:00Z on the same date. As
    // time it is seven hours earlier. Every captured_at written so far carries
    // +03:00, so this is what the ordering actually rests on.
    expect(
      readAt({ captured_on: '2026-07-28', captured_at: '2026-07-28T01:58:00+03:00' }),
    ).toBeLessThan(readAt({ captured_on: '2026-07-28', captured_at: '2026-07-28T09:00:00Z' }));
  });

  it('puts a dated reading before a timed one from the same day, at any hour', () => {
    // A timed reading is a correction or a second look, and both come after.
    //
    // The early hours are the case that matters and the one that broke. A
    // correction written at 02:00+03:00 is 23:00 UTC the day before, so filling
    // a date-only reading in as midnight UTC put the correction BEFORE the thing
    // it corrects — and the rule that only a later reading may retire an earlier
    // one then quietly refused it, leaving both VakıfBank readings in the table
    // under two spellings of the name.
    for (const at of [
      '2026-07-28T00:30:00+03:00',
      '2026-07-28T02:00:00+03:00',
      '2026-07-28T15:00:00+03:00',
    ]) {
      expect(readAt({ captured_on: '2026-07-28' })).toBeLessThan(
        readAt({ captured_on: '2026-07-28', captured_at: at }),
      );
    }
  });

  it('compares two offsets against each other correctly', () => {
    expect(readAt({ captured_on: '2026-07-28', captured_at: '2026-07-28T09:00:00Z' })).toBeLessThan(
      readAt({ captured_on: '2026-07-28', captured_at: '2026-07-28T15:00:00+03:00' }),
    );
  });

  it('sorts an unreadable timestamp to the beginning rather than nowhere', () => {
    // NaN compares false against everything, so a report carrying one would be
    // neither newer nor older than anything and would win or lose by accident.
    expect(readAt({ captured_on: '2026-07-28', captured_at: 'dün' })).toBe(0);
  });
});
