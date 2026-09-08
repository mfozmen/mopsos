import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Where the salary comes from, which decides whether a protocol rate is reachable at all. */
export const SALARIES = ['private', 'public', 'retired'] as const;

export type Salary = (typeof SALARIES)[number];

export interface Household {
  age: number;
  owns_home: boolean;
  newlywed: boolean;
  salary: Salary;
}

/** What the form has always shipped with, and what a first run still gets. */
export const DEFAULT_HOUSEHOLD: Household = {
  age: 35,
  owns_home: false,
  newlywed: false,
  salary: 'private',
};

const FILE = 'household.json';

/**
 * Old enough to borrow, young enough to be alive. Not a bank's rule — banks
 * differ, and the page says so — just the range outside which a number in this
 * field is a typo rather than an answer.
 *
 * Exported because the server refuses the same range on the way in. Two copies
 * of a bound is one edit away from a page that accepts what the record then
 * throws out, and nothing on screen to say why.
 */
export const AGE = { least: 18, most: 100 };

function valid(value: unknown): value is Household {
  if (typeof value !== 'object' || value === null) return false;
  const { age, owns_home: owns, newlywed, salary } = value as Record<string, unknown>;

  return (
    typeof age === 'number' &&
    Number.isInteger(age) &&
    age >= AGE.least &&
    age <= AGE.most &&
    typeof owns === 'boolean' &&
    typeof newlywed === 'boolean' &&
    typeof salary === 'string' &&
    (SALARIES as readonly string[]).includes(salary)
  );
}

/**
 * Who the reader is, as far as the rate table is concerned.
 *
 * Four answers that decide which rates the reader can actually get — owning a
 * home removes every "İlk Evim" product and cuts the loan-to-value ratio by
 * three quarters, age caps the term, salary decides whether a protocol rate is
 * reachable — and they were being retyped on every regeneration of the page.
 *
 * They live with the record rather than in the browser. Not for tidiness: they
 * are a research input, not interface state. A housing seer reasoning about
 * what this reader can afford needs them, and a value in a browser profile is
 * not available to a subagent. The record is also a private repository, so a
 * change to the household gets a timestamp for free — a verdict written before
 * the reader owned a home and one written after rest on different situations.
 *
 * Never the public repository, for the reason SECURITY.md gives.
 *
 * Anything unreadable falls back to the defaults rather than throwing. This is
 * the one place in the record where that is the right trade: nothing here is a
 * measurement, so nothing is lost by asking again — and a page that will not
 * render is worse than a page asking a question it already asked.
 */
export function readHousehold(root: string): Household {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(root, FILE), 'utf8'));
    if (!valid(parsed)) return DEFAULT_HOUSEHOLD;

    // Named rather than spread: the file carries a schema_version this type does
    // not, and a spread would hand it to the page as if it were an answer.
    return {
      age: parsed.age,
      owns_home: parsed.owns_home,
      newlywed: parsed.newlywed,
      salary: parsed.salary,
    };
  } catch {
    return DEFAULT_HOUSEHOLD;
  }
}

/** Overwritten rather than appended: this is a current state, not an observation. */
export function writeHousehold(root: string, household: Household): void {
  writeFileSync(
    join(root, FILE),
    `${JSON.stringify({ schema_version: 1, ...household }, null, 2)}\n`,
    'utf8',
  );
}
