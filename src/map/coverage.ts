import type { ShownMarketReport } from '../market/load.js';

import { IZMIR_DISTRICTS } from './izmir.js';

/** The province this map draws. Only its districts are counted. */
const PROVINCE = 'İzmir';

const KNOWN = new Set(IZMIR_DISTRICTS.map((district) => district.name));

/**
 * How much of each district has been read, as a count of mahalle.
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
 * A district with no reading is absent from the map rather than present with a
 * zero. "Nobody has looked" and "looked and found nothing" are different
 * answers, and the second is not one this record can currently produce.
 */
export function coverageByDistrict(reports: ShownMarketReport[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const report of reports) {
    const [province, district] = report.place.split(' / ');
    if (province !== PROVINCE || district === undefined || !KNOWN.has(district)) continue;

    counts.set(district, (counts.get(district) ?? 0) + report.neighbourhoods.length);
  }

  return counts;
}
