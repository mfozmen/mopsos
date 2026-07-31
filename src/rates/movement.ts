import { bestOffer, type RateOffer, type RateReport, trueMonthlyRate } from './load.js';

export interface Movement {
  /**
   * Monthly percentage points, positive when borrowing got dearer.
   *
   * Points rather than a ratio: the figures are already percentages, and "the
   * rate rose 4%" reads as four points to anyone who is not looking for the
   * distinction.
   */
  points: number;
  /**
   * Which series this is.
   *
   * `offer` follows one product the bank sold at both readings. `bank` compares
   * the best it had then against the best it has now, which is a different
   * question and can move when nothing was repriced — a cheaper product
   * appearing is not a rate falling.
   */
  basis: 'offer' | 'bank';
  /** The product followed, when the series is one. */
  product?: string;
}

/**
 * What changed between an earlier reading of a bank and a later one.
 *
 * Measured on what an offer really costs, never on the headline. The two move
 * independently — Akbank's %1,99 really costs %3,32 — so a series built on the
 * headline would report movements that nobody paid and miss the ones they did.
 *
 * Nothing is returned unless both readings can be measured. Several banks in
 * this record gained a worked example only because a scout went back for one,
 * and a real cost that appears between two readings is our knowledge changing,
 * not the price. Drawn as a rise it would be a lie about the market, and it
 * would be a rise of forty or fifty basis points — larger than most real moves.
 */
export function moved(now: RateReport, then: RateReport): Movement | undefined {
  const led = bestOffer(now);
  // Matched on the product name exactly, because there is nothing else to match
  // on. A bank that retitles a product between readings — a wording tweak, a
  // dotting fix — reads here as having withdrawn one and launched another, and
  // the comparison quietly falls back to the bank. Bank names get followed
  // through supersedes claims for this reason; products have no such record to
  // follow, and inventing a similarity rule would merge two real products the
  // first time two names look alike.
  const kept = led === undefined ? undefined : then.offers.find((o) => o.product === led.product);

  if (led !== undefined && kept !== undefined) {
    const points = change(led, kept);
    return points === undefined ? undefined : { points, basis: 'offer', product: led.product };
  }

  const points = change(led, bestOffer(then));
  return points === undefined ? undefined : { points, basis: 'bank' };
}

function change(later?: RateOffer, earlier?: RateOffer): number | undefined {
  if (later === undefined || earlier === undefined) return undefined;

  const laterCost = trueMonthlyRate(later);
  const earlierCost = trueMonthlyRate(earlier);
  return laterCost === undefined || earlierCost === undefined ? undefined : laterCost - earlierCost;
}
