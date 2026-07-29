import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { assertValid, ValidationError } from '../schema/validate.js';

const SCHEMA_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../schemas');

/** A plan as a firm publishes one, with one field changed per test. */
function plan(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    product: 'Konut — 240 ay, tarih belirlemeli',
    amount_financed: 3_000_000,
    total_payable: 3_270_000,
    organisation_fee: 270_000,
    organisation_fee_rate: 9,
    down_payment_ratio: 20,
    term_months: 240,
    delivery_after_months: 36,
    delivery_basis: 'contractual',
    ...overrides,
  };
}

/** The same plan with fields removed, so each test isolates one missing thing. */
function planWithout(...keys: string[]): Record<string, unknown> {
  const value = plan();
  for (const key of keys) delete value[key];
  return value;
}

function report(overrides: Record<string, unknown> = {}): unknown {
  return {
    schema_version: 1,
    provider: 'Bir Tasarruf Finansman A.Ş.',
    captured_on: '2026-07-29',
    source_url: 'https://example.test/konut-tasarruf',
    plans: [plan()],
    ...overrides,
  };
}

function problems(data: unknown): string[] {
  try {
    assertValid('savings-finance-report', data);
  } catch (error) {
    if (error instanceof ValidationError) return error.problems;
    throw error;
  }
  throw new Error('expected validation to fail, but it passed');
}

describe('the savings finance report schema', () => {
  it('accepts a plan as a firm publishes one', () => {
    expect(() => {
      assertValid('savings-finance-report', report());
    }).not.toThrow();
  });

  it('accepts a firm that publishes nothing, which is a real answer', () => {
    // "Looked, found nothing" and "nobody looked" are different answers, and the
    // record has to be able to tell them apart.
    expect(() => {
      assertValid('savings-finance-report', report({ plans: [] }));
    }).not.toThrow();
  });

  it('refuses a plan that does not say whether the wait is promised or hoped', () => {
    // The whole risk of this product is the difference between a teslimat date
    // the sözleşme owes you and one the firm projects. A plan recorded without
    // it reads as though the date were a fact.
    expect(problems(report({ plans: [planWithout('delivery_basis')] }))).toContain(
      "/plans/0 must have required property 'delivery_basis'",
    );
  });

  it('refuses a wait that is neither contractual nor indicative', () => {
    expect(problems(report({ plans: [plan({ delivery_basis: 'muhtemelen' })] }))).toContain(
      '/plans/0/delivery_basis must be equal to one of the allowed values',
    );
  });

  it('refuses a plan with no organisation fee in either form', () => {
    // The fee is the entire price of the product — these firms may charge
    // nothing else. A plan without it is a price list with no price on it.
    const unpriced = planWithout('organisation_fee', 'organisation_fee_rate');

    expect(problems(report({ plans: [unpriced] }))).not.toHaveLength(0);
  });

  it('accepts a fee published only as a percentage, which is the common case', () => {
    expect(() => {
      assertValid('savings-finance-report', report({ plans: [planWithout('organisation_fee')] }));
    }).not.toThrow();
  });

  it('accepts a fee published only in lira', () => {
    expect(() => {
      assertValid(
        'savings-finance-report',
        report({ plans: [planWithout('organisation_fee_rate')] }),
      );
    }).not.toThrow();
  });

  it('refuses an invented Turkish key rather than silently ignoring it', () => {
    // Three rate-scout runs each invented their own Turkish field names and all
    // three files were rejected on load. Rejected loudly is the point.
    expect(problems(report({ plans: [plan({ organizasyon_ucreti: 270_000 })] }))).toContain(
      '/plans/0 must NOT have additional properties',
    );
  });

  it('asks for a reading in exactly the words the rate report asks for it', () => {
    // Every scout is held to the same rules about what a reading may rest on.
    // Two schemas describing it differently is how those rules drift apart.
    const description = (file: string): unknown =>
      (
        JSON.parse(readFileSync(join(SCHEMA_DIR, file), 'utf8')) as {
          properties: { reading?: { description?: string } };
        }
      ).properties.reading?.description;

    expect(description('savings-finance-report.schema.json')).toBe(
      description('rate-report.schema.json'),
    );
  });
});
