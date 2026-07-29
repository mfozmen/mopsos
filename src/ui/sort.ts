/**
 * What a table cell means when it is being sorted.
 *
 * Shared by the page and its tests rather than written twice: the page bundles
 * this through the same esbuild step as the mortgage arithmetic, so the sort a
 * test proves is the sort the reader gets.
 */

/** dd.mm.yyyy, which is how every date on this page is written. */
const TURKISH_DATE = /^(\d{2})\.(\d{2})\.(\d{4})$/;

/**
 * A cell as something comparable, or nothing when it holds no value.
 *
 * Nothing rather than zero, and that is the point of the whole file. A dash
 * means "not known" — most of the real-cost column is dashes — and zero would
 * sort those rows to the top of an ascending price column, presenting the
 * least-informative rows as the best answers.
 */
export function sortKey(text: string): number | string | undefined {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed === '—' || trimmed === '-') return undefined;

  const date = TURKISH_DATE.exec(trimmed);
  if (date) return Number(`${date[3]}${date[2]}${date[1]}`);

  // Everything numeric on this page is Turkish-formatted and wrapped in
  // something: %2,72 · 2,73× · 70.967 ₺ · 48.500.
  const digits = trimmed.replace(/[^\d,.-]/g, '');
  if (/^-?\d[\d.]*(,\d+)?$/.test(digits)) {
    return Number(digits.replaceAll('.', '').replace(',', '.'));
  }

  return trimmed;
}

/**
 * Compares two cells, with unknowns last whichever way the column is sorted.
 *
 * Last in BOTH directions, which is why this is not a plain comparator: "not
 * known" is never the answer to "which is best", so it does not belong at
 * either end.
 *
 * Text is compared the way Turkish sorts it — ı before i, ş after s — because a
 * reader looks for a bank where the alphabet says it is, not where the code
 * points fall.
 */
export function compareCells(left: string, right: string, direction: number): number {
  const a = sortKey(left);
  const b = sortKey(right);

  if (a === undefined && b === undefined) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;

  if (typeof a === 'number' && typeof b === 'number') return (a - b) * direction;

  return String(a).localeCompare(String(b), 'tr') * direction;
}
