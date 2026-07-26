import { describe, expect, it } from 'vitest';

import { aggregate, brier, calibrationCurve, horizonBucket, type ScoredVerdict } from './brier.js';

describe('brier', () => {
  it('is 0 for a confident call that was right', () => {
    expect(brier(1, true)).toBe(0);
  });

  it('is 1 for a confident call that was wrong', () => {
    expect(brier(1, false)).toBe(1);
  });

  it('is 0.25 for a coin flip, whichever way it lands', () => {
    expect(brier(0.5, true)).toBe(0.25);
    expect(brier(0.5, false)).toBe(0.25);
  });

  it('squares the distance from the truth', () => {
    expect(brier(0.62, true)).toBeCloseTo(0.1444, 10);
    expect(brier(0.62, false)).toBeCloseTo(0.3844, 10);
  });

  it('rejects a probability outside 0 and 1 rather than returning a number', () => {
    expect(() => brier(1.5, true)).toThrow(/probability/i);
    expect(() => brier(-0.1, true)).toThrow(/probability/i);
  });
});

const scored = (
  seer: string,
  probability: number,
  hit: boolean,
  overrides: Partial<ScoredVerdict> = {},
): ScoredVerdict => ({
  seer,
  asset_class: 'housing',
  horizon_days: 180,
  probability,
  hit,
  ...overrides,
});

describe('aggregate', () => {
  it('averages the Brier score within a group', () => {
    const result = aggregate(
      [
        scored('cautious', 0.5, true),
        scored('cautious', 0.5, false),
        scored('optimistic', 1, true),
      ],
      (entry) => entry.seer,
    );

    expect(result).toEqual([
      { key: 'cautious', count: 2, brier: 0.25 },
      { key: 'optimistic', count: 1, brier: 0 },
    ]);
  });

  it('groups by asset class when asked', () => {
    const result = aggregate(
      [scored('cautious', 1, true), scored('cautious', 1, false, { asset_class: 'fx' })],
      (entry) => entry.asset_class,
    );

    expect(result).toEqual([
      { key: 'fx', count: 1, brier: 1 },
      { key: 'housing', count: 1, brier: 0 },
    ]);
  });

  it('separates horizons, so a probe record cannot flatter a long call', () => {
    const result = aggregate(
      [
        scored('cautious', 1, true, { horizon_days: 28 }),
        scored('cautious', 1, false, { horizon_days: 400 }),
      ],
      (entry) => `${entry.seer}/${horizonBucket(entry.horizon_days)}`,
    );

    // Sorted by key, so the two horizons are reported apart rather than averaged.
    expect(result).toEqual([
      { key: 'cautious/long', count: 1, brier: 1 },
      { key: 'cautious/probe', count: 1, brier: 0 },
    ]);
  });

  it('returns nothing for an empty record rather than a flattering zero', () => {
    // A seer with no resolved verdicts has no score. Zero would read as perfect.
    expect(aggregate([], (entry) => entry.seer)).toEqual([]);
  });
});

describe('horizonBucket', () => {
  it.each([
    [14, 'probe'],
    [56, 'probe'],
    [57, 'short'],
    [182, 'short'],
    [183, 'medium'],
    [365, 'medium'],
    [366, 'long'],
  ])('puts %s days in %s', (days, expected) => {
    expect(horizonBucket(days)).toBe(expected);
  });
});

describe('calibrationCurve', () => {
  it('reports predicted confidence against what actually happened', () => {
    const curve = calibrationCurve([
      scored('cautious', 0.9, true),
      scored('cautious', 0.9, true),
      scored('cautious', 0.9, false),
      scored('cautious', 0.1, false),
    ]);

    expect(curve).toEqual([
      { bucket: '0.0-0.2', count: 1, predicted: 0.1, observed: 0 },
      { bucket: '0.8-1.0', count: 3, predicted: 0.9, observed: 2 / 3 },
    ]);
  });

  it.each([
    [0.2, '0.2-0.4'],
    [0.4, '0.4-0.6'],
    [0.6, '0.6-0.8'],
    [0.8, '0.8-1.0'],
    [1, '0.8-1.0'],
  ])('puts a probability of exactly %s in %s', (probability, bucket) => {
    // 0.6 / 0.2 is 2.9999999999999996 in IEEE-754, so dividing puts an exact
    // boundary value one bucket too low and silently misreports calibration.
    expect(calibrationCurve([scored('cautious', probability, true)])[0]?.bucket).toBe(bucket);
  });

  it('omits buckets nothing fell into', () => {
    expect(calibrationCurve([scored('cautious', 0.5, true)])).toEqual([
      { bucket: '0.4-0.6', count: 1, predicted: 0.5, observed: 1 },
    ]);
  });

  it('shows an overconfident seer as predicted above observed', () => {
    const curve = calibrationCurve([
      scored('sure', 0.9, false),
      scored('sure', 0.9, false),
      scored('sure', 0.9, true),
    ]);

    expect(curve[0]?.predicted).toBeGreaterThan(curve[0]!.observed);
  });
});
