import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { referencePeriodEnd } from '../schema/period.js';

const CALENDAR_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../data/calendars');

const MS_PER_DAY = 86_400_000;

interface Release {
  reference_period: string;
  published: string;
}

interface Publication {
  name: string;
  series: string[];
  releases: Release[];
}

interface Calendar {
  publications: Publication[];
}

export class UnknownSeriesError extends Error {
  constructor(readonly series: string) {
    super(
      `${series} has no pinned publication calendar: its check_after cannot be derived. ` +
        'Add it to data/calendars/ before writing a verdict on it.',
    );
    this.name = 'UnknownSeriesError';
  }
}

// Every year's file, old ones included: a verdict written in 2026 must still
// derive the same date after the 2027 calendar lands.
const PUBLICATIONS: Publication[] = readdirSync(CALENDAR_DIR)
  .filter((name) => name.endsWith('.json'))
  .flatMap(
    (name) => (JSON.parse(readFileSync(join(CALENDAR_DIR, name), 'utf8')) as Calendar).publications,
  );

function days(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / MS_PER_DAY;
}

function addDays(date: string, count: number): string {
  return new Date(Date.parse(date) + count * MS_PER_DAY).toISOString().slice(0, 10);
}

/**
 * The first date the value of `series` for `referencePeriod` can exist.
 *
 * The pinned release date when the calendar lists the period. Otherwise — a
 * period whose year's calendar is not out yet — the end of the period plus the
 * slowest release the pinned calendars show for that publication, so the
 * estimate can only err late, never early.
 */
export function checkAfter(series: string, referencePeriod: string): string {
  const releases = PUBLICATIONS.filter((p) => p.series.includes(series)).flatMap((p) => p.releases);
  if (releases.length === 0) throw new UnknownSeriesError(series);

  const pinned = releases.find((r) => r.reference_period === referencePeriod);
  if (pinned) return pinned.published;

  const slowest = Math.max(
    ...releases.map((r) => days(referencePeriodEnd(r.reference_period), r.published)),
  );
  return addDays(referencePeriodEnd(referencePeriod), slowest);
}
