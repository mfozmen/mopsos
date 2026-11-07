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
  year: number;
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
const CALENDARS: Calendar[] = readdirSync(CALENDAR_DIR)
  .filter((name) => name.endsWith('.json'))
  .map((name) => JSON.parse(readFileSync(join(CALENDAR_DIR, name), 'utf8')) as Calendar);

const PUBLICATIONS: Publication[] = CALENDARS.flatMap((calendar) => calendar.publications);

/**
 * Throws unless a calendar for `year` is pinned. Past the last pinned year,
 * check_after silently falls back to an estimate — so the gap has to be loud.
 */
export function assertCalendarCovers(year: number): void {
  if (!CALENDARS.some((calendar) => calendar.year === year)) {
    throw new Error(
      `No TCMB publication calendar pinned for ${year}. Add data/calendars/tcmb-${year}.json ` +
        '— see data/calendars/README.md for the refresh procedure.',
    );
  }
}

function days(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / MS_PER_DAY;
}

function addDays(date: string, count: number): string {
  return new Date(Date.parse(date) + count * MS_PER_DAY).toISOString().slice(0, 10);
}

export class PeriodMismatchError extends Error {
  constructor(
    readonly series: string,
    readonly referencePeriod: string,
  ) {
    super(
      `${series} is not published for periods shaped like ${referencePeriod}: ` +
        'there is no single value to read, so the rule could be settled against any of several',
    );
    this.name = 'PeriodMismatchError';
  }
}

/** Day, ISO week or month — the three shapes a reference period can take. */
function shape(period: string): string {
  return period.replaceAll(/\d/g, '9');
}

/**
 * The first date the value of `series` for `referencePeriod` can exist.
 *
 * The pinned release date when the calendar lists the period. Otherwise — a
 * period whose year's calendar is not out yet — an estimate: the end of the
 * period plus the slowest release the pinned calendars show. That is a floor
 * for validation, not a promise the value exists on that day; resolution still
 * has to find the first print before it can settle anything.
 */
export function checkAfter(series: string, referencePeriod: string): string {
  const releases = PUBLICATIONS.filter((p) => p.series.includes(series)).flatMap((p) => p.releases);
  if (releases.length === 0) throw new UnknownSeriesError(series);

  if (!releases.some((r) => shape(r.reference_period) === shape(referencePeriod))) {
    throw new PeriodMismatchError(series, referencePeriod);
  }

  const pinned = releases.find((r) => r.reference_period === referencePeriod);
  if (pinned) return pinned.published;

  const slowest = Math.max(
    ...releases.map((r) => days(referencePeriodEnd(r.reference_period), r.published)),
  );
  return addDays(referencePeriodEnd(referencePeriod), slowest);
}
