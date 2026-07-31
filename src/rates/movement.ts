import { bestOffer, type RateReport, trueMonthlyRate } from './load.js';

export interface Movement {
  /**
   * Monthly percentage points, positive when borrowing got dearer.
   *
   * Points rather than a ratio: the figures are already percentages, and "the
   * rate rose 4%" reads as four points to anyone who is not looking for the
   * distinction.
   */
  points: number;
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
  const nowOffer = bestOffer(now);
  const thenOffer = bestOffer(then);
  if (nowOffer === undefined || thenOffer === undefined) return undefined;

  const nowCost = trueMonthlyRate(nowOffer);
  const thenCost = trueMonthlyRate(thenOffer);
  if (nowCost === undefined || thenCost === undefined) return undefined;

  return { points: nowCost - thenCost };
}
