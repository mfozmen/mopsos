import { describe, expect, it } from 'vitest';

import { checkAfter, PeriodMismatchError, UnknownSeriesError } from './calendar.js';

describe('checkAfter', () => {
  it('returns the pinned release date of the house price index, not the end of the month', () => {
    // September 2026 ends on the 30th; TCMB released it on 16 October.
    expect(checkAfter('TP.KFE.TR', '2026-09')).toBe('2026-10-16');
  });

  it('reads a regional index from the same release', () => {
    expect(checkAfter('TP.KFE.TR31', '2026-10')).toBe('2026-11-17');
  });

  it('follows a series with a different lag: weekly loan rates come out days, not weeks, later', () => {
    expect(checkAfter('TP.KTF12', '2026-W45')).toBe('2026-11-12');
  });

  it('falls back to the longest lag the pinned calendar shows when the period is not on it yet', () => {
    // The 2027 calendar is not published yet. The slowest 2026 KFE release came
    // 20 days after its month ended (Nisan 2026 on 20 May), so March 2027 cannot
    // be read before 20 April.
    expect(checkAfter('TP.KFE.TR', '2027-03')).toBe('2027-04-20');
  });

  it('refuses a monthly period on a weekly series, which has no single value to read', () => {
    expect(() => checkAfter('TP.KTF17', '2026-09')).toThrow(PeriodMismatchError);
  });

  it('refuses a series that has no pinned release date', () => {
    expect(() => checkAfter('TP.NOT.PINNED', '2026-09')).toThrow(UnknownSeriesError);
  });
});
