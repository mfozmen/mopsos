/**
 * When a reading happened, as a number, so two of them can be ordered.
 *
 * The obvious version compares the ISO strings and is wrong. Scouts record
 * local time with an offset — `2026-07-28T01:58:00+03:00` — while a report that
 * carries only a date is filled in as midnight UTC. As text the offset one
 * sorts later; as time it is an hour and two minutes earlier. Every
 * `captured_at` written into this record so far carries `+03:00`, so this is
 * not a hypothetical.
 *
 * A date alone becomes the EARLIEST instant that date can begin anywhere on
 * earth — midnight at UTC+14 — which puts a dated reading before any timed
 * reading from the same day whatever offset that one carries. That is the right
 * way round: a timed reading is either a correction or a second look, and both
 * are later.
 *
 * Midnight UTC looks like the obvious filler and is not. A correction written
 * at 02:00+03:00 is 23:00 UTC the day before, so it landed BEFORE the dated
 * reading it corrects — and the rule that only a later reading may retire an
 * earlier one then quietly refused it, leaving both VakıfBank readings in the
 * table under two spellings of the bank's name.
 */
export function readAt(reading: { captured_on: string; captured_at?: string }): number {
  const at = Date.parse(reading.captured_at ?? `${reading.captured_on}T00:00:00+14:00`);

  // An unparseable timestamp sorts as the beginning of time rather than as NaN,
  // which compares false against everything and would quietly make a report
  // unorderable. The schema already refuses one; this is the second line.
  return Number.isNaN(at) ? 0 : at;
}
