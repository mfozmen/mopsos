import type { ShownMarketReport } from '../market/load.js';

import { IZMIR_DISTRICTS } from './izmir.js';
import { TURKEY_PROVINCES } from './turkey.js';

/** The province this map draws. Only its districts are counted. */
const PROVINCE = 'İzmir';

const KNOWN_DISTRICTS = new Set(IZMIR_DISTRICTS.map((district) => district.name));
const KNOWN_PROVINCES = new Set(TURKEY_PROVINCES.map((province) => province.name));

/**
 * The two halves of a place string, or nothing if it is not one.
 *
 * A reading with no mahalle in it is nothing to either map. The schema allows
 * the array to be empty, so without this a run that came back with nothing
 * would set a count of zero — and a zero on the map reads as "looked and found
 * nothing", which is the one answer this record cannot make.
 */
function readingAt(report: ShownMarketReport): { province: string; district: string } | undefined {
  const [province, district] = report.place.split(' / ');
  if (province === undefined || district === undefined) return undefined;
  if (report.neighbourhoods.length === 0) return undefined;

  return { province, district };
}

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
 *
 * A reading with no mahalle in it is skipped for the same reason. The schema
 * allows the array to be empty, so without this a run that came back with
 * nothing would set the count to zero — and a zero on the map is the second
 * answer, printed where the record only supports the first.
 */
export function coverageByDistrict(reports: ShownMarketReport[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const report of reports) {
    const at = readingAt(report);
    if (at === undefined || at.province !== PROVINCE || !KNOWN_DISTRICTS.has(at.district)) continue;

    counts.set(at.district, (counts.get(at.district) ?? 0) + report.neighbourhoods.length);
  }

  return counts;
}

/**
 * The same count one level up: mahalle per province, from every reading.
 *
 * Not restricted to the province the district layer draws. The country map has
 * eighty-one shapes and the record may hold a reading in any of them; dropping
 * a Manisa reading because no Manisa district shapes exist would make the
 * record look smaller than it is on the one view meant to show its extent.
 */
export function coverageByProvince(reports: ShownMarketReport[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const report of reports) {
    const at = readingAt(report);
    if (at === undefined || !KNOWN_PROVINCES.has(at.province)) continue;

    counts.set(at.province, (counts.get(at.province) ?? 0) + report.neighbourhoods.length);
  }

  return counts;
}
