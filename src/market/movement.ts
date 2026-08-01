import { type ReadNeighbourhood } from './places.js';

export interface Move {
  name: string;
  from: number;
  to: number;
  /** The change as a fraction of the earlier figure. */
  ratio: number;
  /**
   * Both listing counts, thinner side first.
   *
   * A change between a 3-listing median and a 40-listing one is not the same
   * evidence as one between 40 and 40, and a move shown without them reads as
   * though it were.
   */
  counts: [number, number];
}

/**
 * What changed in a district between an earlier reading and the one on show.
 *
 * Per neighbourhood, never per district. A district median moves when the mix
 * of neighbourhoods read changes, with no price moving at all — and the unit of
 * the decision is a mahalle anyway.
 *
 * Nothing at all where the two readings used different bands. The band is
 * recorded in `source` precisely so this check can happen, and subtracting two
 * medians taken on different room counts produces a number about the sampling
 * rather than about the place.
 */
export function movedIn(
  now: { neighbourhoods: ReadNeighbourhood[] },
  then: { neighbourhoods: ReadNeighbourhood[] },
): Move[] {
  return now.neighbourhoods.flatMap((current) => {
    const before = then.neighbourhoods.find((other) => other.name === current.name);
    if (before === undefined) return [];
    if (before.source !== current.source) return [];
    if (current.sale_per_m2 === undefined || before.sale_per_m2 === undefined) return [];

    return [
      {
        name: current.name,
        from: before.sale_per_m2,
        to: current.sale_per_m2,
        ratio: (current.sale_per_m2 - before.sale_per_m2) / before.sale_per_m2,
        counts: [
          Math.min(before.listing_count, current.listing_count),
          Math.max(before.listing_count, current.listing_count),
        ] as [number, number],
      },
    ];
  });
}
