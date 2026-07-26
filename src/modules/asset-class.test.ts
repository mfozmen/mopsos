import { describe, expect, it } from 'vitest';

import type { Verdict } from '../schema/types.js';
import { assertRegisteredAssetClass, UnknownAssetClassError } from './asset-class.js';

const VERDICT: Verdict = {
  schema_version: 1,
  id: '2026-07-26-housing-tr-kfe-q3',
  seer: 'cautious',
  asset_class: 'housing',
  question: 'Will the TCMB house price index for September 2026 be above 41.5?',
  probability: 0.62,
  created_at: '2026-07-26',
  due_at: '2026-09-30',
  resolution: {
    source: 'evds',
    series: 'TP.KTF17',
    reference_period: '2026-09',
    check_after: '2026-10-16',
    rule: 'value > 41.5',
    print: 'first',
  },
};

describe('assertRegisteredAssetClass', () => {
  it('accepts a class that has a module', () => {
    expect(() => {
      assertRegisteredAssetClass(VERDICT, ['housing', 'fx']);
    }).not.toThrow();
  });

  it('accepts a class nobody had thought of, once its module exists', () => {
    // The point of the registry: a new class is a folder and a file, with no
    // schema to edit. A verdict must follow the same rule or the claim is false.
    const crypto = { ...VERDICT, asset_class: 'crypto' as Verdict['asset_class'] };

    expect(() => {
      assertRegisteredAssetClass(crypto, ['housing', 'crypto']);
    }).not.toThrow();
  });

  it('rejects a class with no module behind it', () => {
    const typo = { ...VERDICT, asset_class: 'housng' as Verdict['asset_class'] };

    expect(() => {
      assertRegisteredAssetClass(typo, ['housing', 'fx']);
    }).toThrow(UnknownAssetClassError);
  });

  it('names the classes that do exist, so a typo is obvious', () => {
    const typo = { ...VERDICT, asset_class: 'housng' as Verdict['asset_class'] };

    try {
      assertRegisteredAssetClass(typo, ['fx', 'housing']);
      throw new Error('expected it to be rejected');
    } catch (error) {
      expect((error as Error).message).toContain('fx, housing');
    }
  });
});
