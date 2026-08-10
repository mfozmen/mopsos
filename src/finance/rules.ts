import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ENERGY_CLASSES, type EnergyClass, type MortgageRules } from './mortgage.js';

const RULES_FILE = join(dirname(fileURLToPath(import.meta.url)), '../../data/mortgage-rules.json');

export class MortgageRulesError extends Error {
  constructor(readonly problems: string[]) {
    super(`Mortgage rules are unusable:\n  ${problems.join('\n  ')}`);
    this.name = 'MortgageRulesError';
  }
}

/**
 * Validates a parsed rules document and returns it typed.
 *
 * The file is hand-maintained and gets edited whenever BDDK publishes a new
 * decision, so it is checked rather than trusted. A half-edited bracket table
 * returns a plausible wrong ratio and nothing ever looks broken — which is
 * exactly the failure this project cannot afford.
 */
export function parseMortgageRules(data: unknown): MortgageRules {
  const problems: string[] = [];
  // Every level is defended: a truncated file must give the reader a list of
  // what is wrong, not a TypeError from three frames down.
  const root = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;

  const loanToValue = (root['loan_to_value'] ?? {}) as Record<string, unknown>;
  const brackets = (loanToValue['brackets'] ?? []) as { ratios?: Record<string, unknown> }[];

  brackets.forEach((bracket, index) => {
    // An extra class ("D") means the table was edited against a newer BDDK
    // decision this code does not understand.
    for (const key of Object.keys(bracket.ratios ?? {})) {
      if (!(ENERGY_CLASSES as readonly string[]).includes(key)) {
        problems.push(`bracket ${index}: unknown energy class "${key}"`);
      }
    }

    for (const energyClass of ENERGY_CLASSES) {
      const ratio = bracket.ratios?.[energyClass];
      // Strictly below 1. At exactly 1 the buyer never needs a down payment and
      // the affordability limit it implies is infinite, so the calculator would
      // have to carry a special case for a rule BDDK has never written.
      if (typeof ratio !== 'number' || !(ratio > 0) || ratio >= 1) {
        problems.push(
          `bracket ${index}: ratio for energy class ${energyClass} must be above 0 and ` +
            `below 1 (got ${JSON.stringify(ratio)})`,
        );
      }
    }
  });

  const bounds = brackets.map((bracket) => (bracket as { value_up_to?: unknown }).value_up_to);

  if (bounds.filter((bound) => bound === null).length !== 1 || bounds.at(-1) !== null) {
    problems.push(
      'brackets must end with exactly one open-ended bracket (value_up_to: null), ' +
        'otherwise a housing value above the table has no ratio',
    );
  }

  // Lookup takes the first bracket whose bound covers the value, so the order is
  // the rule itself, not presentation.
  for (let index = 1; index < bounds.length - 1; index += 1) {
    if (!((bounds[index - 1] as number) < (bounds[index] as number))) {
      problems.push(`brackets are not in ascending order at index ${index}`);
    }
  }

  const term = (root['term'] ?? {}) as Record<string, unknown>;
  const maxMonths = term['conventional_max_months'];

  if (typeof maxMonths !== 'number' || !Number.isInteger(maxMonths) || maxMonths < 1) {
    problems.push(
      `term.conventional_max_months must be a whole number of at least 1 (got ${String(maxMonths)})`,
    );
  }

  // Optional, and bounded on both sides: below 18 is nonsense and above 120 is a
  // typo rather than a bank that lends to the very old. It silently shortens
  // every term, so it is checked rather than taken.
  const maxAge = term['conventional_max_age_at_final_instalment'];

  if (
    maxAge !== undefined &&
    (typeof maxAge !== 'number' || !Number.isInteger(maxAge) || maxAge < 18 || maxAge > 120)
  ) {
    problems.push(
      'term.conventional_max_age_at_final_instalment must be a whole number of years ' +
        `between 18 and 120 (got ${JSON.stringify(maxAge)})`,
    );
  }

  // Optional: absent means nobody has recorded the reduction, and the honest
  // reading of that is "unknown", not "does not apply".
  const reduction = root['existing_home_reduction'] as Record<string, unknown> | undefined;
  const multiplier = reduction?.['multiplier'];

  if (
    reduction !== undefined &&
    (typeof multiplier !== 'number' || multiplier <= 0 || multiplier > 1)
  ) {
    problems.push(
      `existing_home_reduction.multiplier must be above 0 and at most 1 (got ${String(multiplier)})`,
    );
  }

  if (problems.length > 0) throw new MortgageRulesError(problems);

  return {
    loan_to_value: {
      brackets: brackets as unknown as {
        value_up_to: number | null;
        ratios: Record<EnergyClass, number>;
      }[],
    },
    term: {
      conventional_max_months: maxMonths as number,
      ...(maxAge === undefined
        ? {}
        : { conventional_max_age_at_final_instalment: maxAge as number }),
    },
    ...(reduction === undefined
      ? {}
      : { existing_home_reduction: { multiplier: multiplier as number } }),
  };
}

/** The pinned rules, read from disk. Node only — see the note in `mortgage.ts`. */
export function loadMortgageRules(): MortgageRules {
  return parseMortgageRules(JSON.parse(readFileSync(RULES_FILE, 'utf8')));
}
