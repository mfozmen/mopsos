/**
 * How much weight an observation can carry.
 *
 * `self_collected` is not a lesser form of `official` — it is a different kind
 * of number. Listing prices are asks, not transactions, and the series only
 * exists from the day collection started. It can say "the median moved up"; it
 * can never say "the price is X".
 */
export type Reliability = 'official' | 'mixed' | 'self_collected';

export interface SnapshotObservation {
  /** The frozen basket: district, neighbourhood, room count, size band. */
  basket_id: string;
  /** ISO day the listings were read. */
  observed_on: string;
  listing_count: number;
  median_price_per_m2: number;
}

/**
 * Where snapshots come from.
 *
 * Deliberately says nothing about how the data is obtained. Listing sites
 * prohibit automated access and actively block it, so a design that assumes one
 * collapses in its first month — and how each source gets fed is an open
 * question the maintainer answers, not one this code decides.
 */
export interface SnapshotSource {
  /** Names the origin, so a series can say where each observation came from. */
  readonly id: string;
  readonly reliability: Reliability;
  read(): SnapshotObservation[];
}
