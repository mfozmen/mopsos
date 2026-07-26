/**
 * Deliberately not `localeCompare`: the record must read identically on every
 * machine, and locale-aware collation is exactly what would make it not. Code
 * point order is arbitrary, but it is the same everywhere.
 */
export function byCodePoint(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}
