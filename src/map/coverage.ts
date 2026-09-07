import type { ShownMarketReport } from '../market/load.js';

import { DISTRICTS_BY_PROVINCE } from './districts.js';
import { TURKEY_PROVINCES } from './turkey.js';

const KNOWN_PROVINCES = new Set(TURKEY_PROVINCES.map((province) => province.name));

const KNOWN_PLACES = new Set(
  DISTRICTS_BY_PROVINCE.flatMap((entry) =>
    entry.districts.map((district) => `${entry.province} / ${district.name}`),
  ),
);

/**
 * The province and district of a reading worth counting, or nothing.
 *
 * A reading with no mahalle in it is nothing to either map. The schema allows
 * the array to be empty, so without this a run that came back with nothing
 * would set a count of zero — and a zero on the map reads as "looked and found
 * nothing", which is the one answer this record cannot make.
 */
function readingAt(report: ShownMarketReport): { province: string; place: string } | undefined {
  const [province, district] = report.place.split(' / ');
  if (province === undefined || district === undefined) return undefined;
  if (report.neighbourhoods.length === 0) return undefined;

  return { province, place: report.place };
}

/**
 * How much of each district has been read, as a count of mahalle.
 *
 * Keyed by the whole place — "İzmir / Menemen" — because district names are not
 * unique across the country: Merkez appears in dozens of provinces, and so do
 * Çay, Kale and Şehitkamil-shaped repeats. Keyed by district alone the counts
 * would leak between provinces.
 *
 * Mahalle rather than reports, because a count of reports says the same thing
 * at every zoom level and means less at each: a 28-mahalle reading of Çiğli and
 * a single-mahalle spot check would draw the same number, and the mahalle layer
 * would have nothing left to show but on and off.
 *
 * `reports` is what `loadMarketReports` returns, which is already one entry per
 * district — the newest reading, with everything it replaced hanging off
 * `earlier`. So counting the top level is counting the current record, and a
 * superseded reading contributes nothing. That is the point rather than a side
 * effect: counted, a correction would make a district look better covered the
 * more often it was re-read, and this is the one repository where coverage must
 * not be something you can manufacture by looking twice.
 *
 * A district with no reading is absent rather than present with a zero.
 */
export function coverageByDistrict(reports: ShownMarketReport[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const report of reports) {
    const at = readingAt(report);
    if (at === undefined || !KNOWN_PLACES.has(at.place)) continue;

    counts.set(at.place, (counts.get(at.place) ?? 0) + report.neighbourhoods.length);
  }

  return counts;
}

/** The same count one level up: mahalle per province, from every reading. */
export function coverageByProvince(reports: ShownMarketReport[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const report of reports) {
    const at = readingAt(report);
    if (at === undefined || !KNOWN_PROVINCES.has(at.province)) continue;

    counts.set(at.province, (counts.get(at.province) ?? 0) + report.neighbourhoods.length);
  }

  return counts;
}

/**
 * Readings the map cannot place, so the page can say so.
 *
 * The district names are derived from a source that has at least one typo in
 * it, and the record's names are written by whoever wrote the reading. When the
 * two disagree the district counts nothing and draws blank — which is exactly
 * what a district nobody has researched looks like. That is the one failure a
 * coverage map can hide, and hiding it would make the map worse than the list
 * it sits above.
 *
 * Named rather than corrected: guessing which shape was meant is how "Çiğli"
 * and "Cigli" become one place, and `places/level.ts` refuses that for the same
 * reason the record refuses to drop a row it cannot read.
 */
export function unmatchedPlaces(reports: ShownMarketReport[]): string[] {
  return reports
    .filter((report) => {
      const at = readingAt(report);
      return at !== undefined && !KNOWN_PLACES.has(at.place);
    })
    .map((report) => report.place);
}
