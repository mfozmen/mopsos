import type { AssetClass } from '../schema/types.js';

export interface ScoredVerdict {
  seer: string;
  asset_class: AssetClass;
  /** due_at minus created_at, so records can be compared at like horizons. */
  horizon_days: number;
  probability: number;
  hit: boolean;
}

export interface Aggregate {
  key: string;
  count: number;
  brier: number;
}

export interface CalibrationBucket {
  bucket: string;
  count: number;
  /** Mean stated confidence in this bucket. */
  predicted: number;
  /** Fraction that actually happened. */
  observed: number;
}

/**
 * The Brier score: the squared distance between what was claimed and what
 * happened. 0 is perfect, 0.25 is a coin flip, 1 is confidently wrong.
 *
 * Pure by design — no clock, no I/O, no configuration. A score that could vary
 * with when or where it was computed would make the track record unfalsifiable,
 * which is the one thing it cannot be.
 */
export function brier(probability: number, hit: boolean): number {
  if (!(probability >= 0 && probability <= 1)) {
    throw new RangeError(`probability must be between 0 and 1, got ${probability}`);
  }

  return (probability - (hit ? 1 : 0)) ** 2;
}

/**
 * Which horizon a verdict belongs to, for grouping.
 *
 * A seer's record on four-week probes says nothing about its record on an
 * eighteen-month call, and averaging the two together lets a good probe record
 * hide a bad long one. The boundaries follow the asset classes: probes resolve
 * within 8 weeks, housing runs 6-24 months.
 */
export function horizonBucket(days: number): 'probe' | 'short' | 'medium' | 'long' {
  if (days <= 56) return 'probe';
  if (days <= 182) return 'short';
  if (days <= 365) return 'medium';
  return 'long';
}

/**
 * Mean Brier per group, sorted by key so two runs read the same.
 *
 * `groupBy` is required on purpose. A default of "by seer" would silently
 * average across asset classes and horizons, which is exactly the aggregation
 * that makes a record look better than it is — so the caller has to say what it
 * is comparing.
 *
 * An empty record yields no rows rather than a zero. Zero is the best possible
 * score, and a seer that has never been measured must not appear to have earned
 * it.
 */
export function aggregate(
  scored: ScoredVerdict[],
  groupBy: (entry: ScoredVerdict) => string,
): Aggregate[] {
  const groups = new Map<string, number[]>();

  for (const entry of scored) {
    const key = groupBy(entry);
    const scores = groups.get(key) ?? [];
    scores.push(brier(entry.probability, entry.hit));
    groups.set(key, scores);
  }

  return [...groups.entries()]
    .map(([key, scores]) => ({
      key,
      count: scores.length,
      brier: scores.reduce((total, score) => total + score, 0) / scores.length,
    }))
    .sort((a, b) => (a.key < b.key ? -1 : 1));
}

const BUCKETS = 5;
const BUCKET_WIDTH = 1 / BUCKETS;

function bucketLabel(index: number): string {
  const low = index * BUCKET_WIDTH;
  return `${low.toFixed(1)}-${(low + BUCKET_WIDTH).toFixed(1)}`;
}

/**
 * Stated confidence against observed frequency, in five buckets.
 *
 * The Brier score alone says how accurate a seer was. This says whether its
 * confidence means anything: a seer that says 90% and is right 60% of the time
 * is differently broken from one that is simply wrong, and only one of the two
 * can be corrected by discounting what it says.
 *
 * Empty buckets are omitted — a bucket with nothing in it has no observed
 * frequency, and drawing it at zero would read as total failure.
 */
export function calibrationCurve(scored: ScoredVerdict[]): CalibrationBucket[] {
  const buckets = new Map<number, ScoredVerdict[]>();

  for (const entry of scored) {
    // Multiply, never divide: 0.6 / 0.2 is 2.9999999999999996 in IEEE-754, so
    // dividing drops an exact boundary value one bucket and silently misreports
    // the seer's calibration. 0.6 * 5 is exactly 3.
    // 1.0 belongs in the top bucket rather than a sixth one of its own.
    const index = Math.min(Math.floor(entry.probability * BUCKETS), BUCKETS - 1);
    buckets.set(index, [...(buckets.get(index) ?? []), entry]);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, entries]) => ({
      bucket: bucketLabel(index),
      count: entries.length,
      predicted: entries.reduce((total, entry) => total + entry.probability, 0) / entries.length,
      observed: entries.filter((entry) => entry.hit).length / entries.length,
    }));
}
