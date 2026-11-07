/**
 * Prints the check_after a verdict on `series` for `period` must carry, read
 * from the pinned publication calendar. Seers copy this instead of guessing.
 *
 * Usage: npm run check:after -- <series> <reference_period>
 */
import { checkAfter } from '../calendar/calendar.js';

const [series, period] = process.argv.slice(2);
if (!series || !period) {
  console.error('Usage: npm run check:after -- <series> <reference_period>');
  process.exit(2);
}

try {
  console.log(checkAfter(series, period));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
