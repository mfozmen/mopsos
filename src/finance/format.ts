/**
 * Reading and writing the numbers the way they are written here: dots group
 * thousands, a comma is the decimal point.
 *
 * This is a module rather than a few lines inside the page's script because it
 * already went wrong once there. A regex written with one backslash too few
 * became `/./g`, which matches every character — every field silently read as
 * zero, and no test could see it.
 */

const NOT_A_NUMBER = /[^0-9.-]/g;

/** Reads `1.234,56` as 1234.56. Returns NaN for anything that is not a number. */
export function parseTurkishNumber(text: string): number {
  const cleaned = text.replaceAll('.', '').replace(',', '.').replace(NOT_A_NUMBER, '');

  // '' and '-' both coerce to something Number() is happy with, and neither is
  // a number the reader typed.
  if (cleaned === '' || cleaned === '-') return Number.NaN;

  return Number(cleaned);
}

/** Writes 1234567 as `1.234.567 ₺`. */
export function formatTry(value: number): string {
  return `${value.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ₺`;
}
