import { describe, expect, it } from 'vitest';

import { ENERGY_CLASSES } from './mortgage.js';
import { loadMortgageRules, MortgageRulesError, parseMortgageRules } from './rules.js';

describe('loadMortgageRules', () => {
  const rules = loadMortgageRules();

  it('parses the pinned BDDK file into the shape the calculator expects', () => {
    expect(rules.term.conventional_max_months).toBeGreaterThan(0);
    expect(rules.loan_to_value.brackets.length).toBeGreaterThan(0);

    for (const bracket of rules.loan_to_value.brackets) {
      expect(Object.keys(bracket.ratios).sort()).toEqual([...ENERGY_CLASSES].sort());
    }
  });

  it('has brackets in ascending order with exactly one open-ended one, last', () => {
    const bounds = rules.loan_to_value.brackets.map((bracket) => bracket.value_up_to);

    expect(bounds.filter((bound) => bound === null)).toHaveLength(1);
    expect(bounds[bounds.length - 1]).toBeNull();

    const bounded = bounds.slice(0, -1) as number[];
    expect(bounded).toEqual([...bounded].sort((a, b) => a - b));
  });
});

describe('parseMortgageRules', () => {
  it('rejects an unknown energy class key, which would silently never match', () => {
    expect(() =>
      parseMortgageRules({
        loan_to_value: { brackets: [{ value_up_to: null, ratios: { A_B: 0.9, C: 0.8, D: 0.7 } }] },
        term: { conventional_max_months: 120 },
      }),
    ).toThrow(/energy class/i);
  });

  it('rejects a ratio outside 0–1, which would lend more than the house is worth', () => {
    expect(() =>
      parseMortgageRules({
        loan_to_value: {
          brackets: [{ value_up_to: null, ratios: { A_B: 1.2, C: 0.8, OTHER: 0.7 } }],
        },
        term: { conventional_max_months: 120 },
      }),
    ).toThrow(/ratio/i);
  });

  it('rejects a ratio of exactly 1: a 100% loan means no down payment is ever needed', () => {
    expect(() =>
      parseMortgageRules({
        loan_to_value: {
          brackets: [{ value_up_to: null, ratios: { A_B: 1, C: 0.8, OTHER: 0.7 } }],
        },
        term: { conventional_max_months: 120 },
      }),
    ).toThrow(/ratio/i);
  });

  it('rejects a conventional_max_months below 1, which would reject every term', () => {
    expect(() =>
      parseMortgageRules({
        loan_to_value: {
          brackets: [{ value_up_to: null, ratios: { A_B: 0.9, C: 0.8, OTHER: 0.7 } }],
        },
        term: { conventional_max_months: 0 },
      }),
    ).toThrow(/conventional_max_months/);
  });

  it('rejects a truncated or empty file with a readable error, not a TypeError', () => {
    // The pinned file is hand-edited; half a document is a realistic accident.
    expect(() => parseMortgageRules({})).toThrow(MortgageRulesError);
    expect(() => parseMortgageRules(null)).toThrow(MortgageRulesError);
    expect(() => parseMortgageRules({ loan_to_value: {}, term: {} })).toThrow(MortgageRulesError);
    expect(() =>
      parseMortgageRules({
        loan_to_value: { brackets: [{ value_up_to: null }] },
        term: { conventional_max_months: 120 },
      }),
    ).toThrow(MortgageRulesError);
  });

  it('rejects a mis-ordered bracket table, which returns a plausible wrong ratio', () => {
    expect(() =>
      parseMortgageRules({
        loan_to_value: {
          brackets: [
            { value_up_to: 7_000_000, ratios: { A_B: 0.8, C: 0.7, OTHER: 0.6 } },
            { value_up_to: 5_000_000, ratios: { A_B: 0.9, C: 0.8, OTHER: 0.7 } },
            { value_up_to: null, ratios: { A_B: 0.4, C: 0.3, OTHER: 0.2 } },
          ],
        },
        term: { conventional_max_months: 120 },
      }),
    ).toThrow(/ascending/i);
  });

  it('rejects a table with no open-ended bracket, leaving top values uncovered', () => {
    expect(() =>
      parseMortgageRules({
        loan_to_value: {
          brackets: [{ value_up_to: 5_000_000, ratios: { A_B: 0.9, C: 0.8, OTHER: 0.7 } }],
        },
        term: { conventional_max_months: 120 },
      }),
    ).toThrow(/open-ended/i);
  });

  /**
   * The age limit silently shortens every term, and a rule that shortens
   * silently is the kind that has to be checked rather than trusted: a
   * validator that quietly accepts anything looks exactly like one that works.
   */
  describe('the age at the final instalment', () => {
    const withAge = (conventional_max_age_at_final_instalment: unknown) => () =>
      parseMortgageRules({
        loan_to_value: {
          brackets: [{ value_up_to: null, ratios: { A_B: 0.4, C: 0.3, OTHER: 0.2 } }],
        },
        term: { conventional_max_months: 120, conventional_max_age_at_final_instalment },
      });

    it('is kept, because the loader used to drop it and nothing noticed', () => {
      expect(withAge(70)().term.conventional_max_age_at_final_instalment).toBe(70);
    });

    it('is allowed to be absent, which means unrecorded rather than unlimited', () => {
      expect(withAge(undefined)().term.conventional_max_age_at_final_instalment).toBeUndefined();
    });

    it('rejects an age that is not a whole number of years', () => {
      expect(withAge(70.5)).toThrow(/whole number of years/i);
    });

    it('rejects an age below any age a bank lends at', () => {
      expect(withAge(17)).toThrow(/between 18 and 120/i);
    });

    it('rejects an age no borrower reaches, which is a typo not a policy', () => {
      expect(withAge(700)).toThrow(/between 18 and 120/i);
    });

    it('rejects an age that is not a number at all', () => {
      expect(withAge('70')).toThrow(/between 18 and 120/i);
    });
  });
});
