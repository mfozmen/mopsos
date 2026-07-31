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
  const same = led === undefined ? undefined : then.offers.find((o) => o.product === led.product);

  const pair =
    led !== undefined && same !== undefined
      ? { now: led, then: same, basis: 'offer' as const, product: led.product }
      : { now: led, then: bestOffer(then), basis: 'bank' as const };

  const points = change(pair.now, pair.then);
  if (points === undefined) return undefined;

  return {
    points,
    basis: pair.basis,
    ...(pair.basis === 'offer' ? { product: pair.product } : {}),
  };
}

function change(now?: RateOffer, then?: RateOffer): number | undefined {
  if (now === undefined || then === undefined) return undefined;

  const nowCost = trueMonthlyRate(now);
  const thenCost = trueMonthlyRate(then);
  return nowCost === undefined || thenCost === undefined ? undefined : nowCost - thenCost;
}
