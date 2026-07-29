import { describe, expect, it } from 'vitest';

import { compareCells, sortKey } from './sort.js';

describe('sortKey', () => {
  it('reads a Turkish number', () => {
    expect(sortKey('48.500')).toBe(48_500);
    expect(sortKey('%2,72')).toBe(2.72);
    expect(sortKey('2,73×')).toBe(2.73);
    expect(sortKey('70.967 ₺')).toBe(70_967);
  });

  it('reads a Turkish date as a point in time, not as text', () => {
    // 28.07.2026 sorts after 27.07.2026, and both after 31.12.2025. As text the
    // last of those wins, which is the wrong answer in the column that says how
    // stale a rate is.
    expect(sortKey('28.07.2026')).toBeGreaterThan(sortKey('27.07.2026') as number);
    expect(sortKey('27.07.2026')).toBeGreaterThan(sortKey('31.12.2025') as number);
  });

  it('reads a dash as nothing at all, not as zero', () => {
    // A dash means "not known". Zero would make the least-informative rows the
    // cheapest ones in an ascending price column.
    expect(sortKey('—')).toBeUndefined();
    expect(sortKey('')).toBeUndefined();
  });

  it('falls back to the text itself', () => {
    expect(sortKey('Akbank')).toBe('Akbank');
  });
});

describe('compareCells', () => {
  it('sorts numbers as numbers', () => {
    expect(['%3,10', '%2,60', '%2,88'].sort((a, b) => compareCells(a, b, 1))).toEqual([
      '%2,60',
      '%2,88',
      '%3,10',
    ]);
  });

  it('sorts Turkish text the way Turkish sorts it', () => {
    // ı comes before i, and ş after s. A default sort puts them wherever the
    // code points fall, which is not where a reader looks for them.
    expect(
      ['İş Bankası', 'Akbank', 'Ziraat', 'Şekerbank'].sort((a, b) => compareCells(a, b, 1)),
    ).toEqual(['Akbank', 'İş Bankası', 'Şekerbank', 'Ziraat']);
  });

  it('keeps unknowns last in both directions', () => {
    // The whole reason this is not a plain comparator. Ascending, a dash must
    // not lead; descending, it must not lead either — "not known" is never the
    // answer to "which is best".
    expect(['—', '%3,10', '%2,60'].sort((a, b) => compareCells(a, b, 1))).toEqual([
      '%2,60',
      '%3,10',
      '—',
    ]);
    expect(['—', '%3,10', '%2,60'].sort((a, b) => compareCells(a, b, -1))).toEqual([
      '%3,10',
      '%2,60',
      '—',
    ]);
  });
});
