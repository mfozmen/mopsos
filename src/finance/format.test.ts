import { describe, expect, it } from 'vitest';

import { formatTry, parseTurkishNumber } from './format.js';

describe('parseTurkishNumber', () => {
  it.each([
    ['1.000.000', 1000000],
    ['3.500.000', 3500000],
    ['120', 120],
    ['2,79', 2.79],
    ['0,5', 0.5],
    ['1.234,56', 1234.56],
    ['60.000 ₺', 60000],
  ])('reads %s as %s', (text, expected) => {
    // Dots group thousands and commas are decimal here. A regex written with one
    // backslash too few matched every character and silently emptied the field,
    // which is why this is a module with tests rather than a line in a string.
    expect(parseTurkishNumber(text)).toBe(expected);
  });

  it.each(['', '   ', 'abc', '-'])('reports %s as not a number', (text) => {
    expect(parseTurkishNumber(text)).toBeNaN();
  });

  it('keeps a negative sign, so a nonsense input is visible rather than swallowed', () => {
    expect(parseTurkishNumber('-500')).toBe(-500);
  });
});

describe('formatTry', () => {
  it('groups thousands with dots, as Turkish does', () => {
    expect(formatTry(1234567)).toBe('1.234.567 ₺');
  });

  it('rounds to whole lira, since kuruş are noise at these sizes', () => {
    expect(formatTry(72415.17)).toBe('72.415 ₺');
  });

  it('survives a round trip', () => {
    expect(parseTurkishNumber(formatTry(3500000))).toBe(3500000);
  });
});
