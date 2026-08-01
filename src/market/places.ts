import { byCodePoint } from '../order.js';

/**
 * What a comparison needs from a reading, and nothing more.
 *
 * Stated as the fields it reads rather than as one of the record's report
 * types. Both the loader's `ShownMarketReport` and the page's own report shape
 * satisfy it, so neither has to be cast to the other — and a cast is where a
 * second declaration of one thing hides until it drifts.
 */
export interface ReadNeighbourhood {
  name: string;
  sale_per_m2?: number;
  rent_per_m2?: number;
  gross_yield?: number;
  listing_count: number;
  confidence?: 'high' | 'medium' | 'low';
  source: string;
}

export interface ReadDistrict {
  /** "İl / İlçe", as the loader writes it. */
  place: string;
  dated: string;
  neighbourhoods: ReadNeighbourhood[];
}

/** One neighbourhood, with everything needed to put it beside another. */
export interface ComparablePlace extends ReadNeighbourhood {
  province: string;
  district: string;
  /** The reading it came from, because a comparison across dates is not one. */
  dated: string;
}

/**
 * Every neighbourhood the record has a price for, flattened across districts.
 *
 * Çiğli and Menemen are separate reports, so putting one neighbourhood beside
 * another today takes two scrolls and a memory — and that is exactly the
 * comparison being made, since the reader lives in one district and is
 * considering another.
 *
 * `listing_count`, `confidence` and `source` travel with every entry and are
 * not optional here. A row built from a 40-listing median and a 3-listing
 * median is not two neighbourhoods compared, it is a measurement beside a
 * guess; and two readings taken on different room counts are not comparable at
 * all, which is why the band is recorded in `source` in the first place.
 *
 * Only the reading on show. A district's earlier readings are its own history
 * and belong under it, not mixed into a list of places.
 */
export function comparable(reports: ReadDistrict[]): ComparablePlace[] {
  return reports
    .flatMap((report) => {
      const [province = '', district = ''] = report.place.split(' / ');

      return report.neighbourhoods
        .filter((neighbourhood) => neighbourhood.sale_per_m2 !== undefined)
        .map((neighbourhood) => ({ ...neighbourhood, province, district, dated: report.dated }));
    })
    .sort((a, b) => byCodePoint(a.name, b.name));
}
