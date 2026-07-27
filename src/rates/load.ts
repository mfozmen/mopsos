import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { effectiveMonthlyRate, IncalculableCostError } from '../finance/effective.js';
import { byCodePoint } from '../order.js';
import { assertValid } from '../schema/validate.js';

export interface RateExample {
  amount: number;
  months: number;
  instalment: number;
  upfront_interest?: number;
  fees?: number;
  /** The bank's own yıllık maliyet oranı, where it publishes one. */
  published_annual_cost_rate?: number;
}

export interface RateOffer {
  product: string;
  /** Percent per month, as Turkish banks quote it. */
  monthly_rate: number;
  /** The bank's worked example, which is what makes the real cost computable. */
  example?: RateExample;
  max_term_months?: number;
  min_amount?: number;
  max_amount?: number;
  conditions?: string;
}

export interface RateReport {
  schema_version: 1;
  bank: string;
  /** A participation bank sells a profit share; the product differs even where the arithmetic does not. */
  kind: 'faiz' | 'kar_payi';
  captured_on: string;
  /** To the minute, when recorded. Present only on readings that need to be ordered within a day. */
  captured_at?: string;
  /** The file this reading replaces, when it is a correction. */
  supersedes?: string;
  source_url: string;
  offers: RateOffer[];
  note?: string;
}

/** The finest timestamp a report carries. A date alone sorts as its first minute. */
function readAt(report: RateReport): string {
  return report.captured_at ?? `${report.captured_on}T00:00:00.000Z`;
}

/**
 * What an offer really costs per month, or nothing when it cannot be known.
 *
 * Nothing — not the quoted rate. Most of these are package rates whose insurance
 * cost the bank does not publish, so the real cost is unknown and higher than
 * the headline. Falling back to the quoted rate would present the very number
 * this exists to correct as though it were the answer.
 */
export function trueMonthlyRate(offer: RateOffer): number | undefined {
  const example = offer.example;
  if (example === undefined) return undefined;

  try {
    return effectiveMonthlyRate({
      principal: example.amount,
      months: example.months,
      monthlyPayment: example.instalment,
      upfrontInterest: example.upfront_interest,
      fees: example.fees,
    });
  } catch (error) {
    /* v8 ignore next 3 -- only reachable from an example that is not a loan */
    if (error instanceof IncalculableCostError) return undefined;
    throw error;
  }
}

/** The cheapest offer in a report, or nothing when the bank published none. */
export function bestOffer(report: RateReport): RateOffer | undefined {
  return [...report.offers].sort((a, b) => a.monthly_rate - b.monthly_rate)[0];
}

/**
 * Reads the rate reports, newest reading per bank.
 *
 * Older readings stay on disk — the record is append-only, and a rate that was
 * on offer last month is evidence of where the market went. They are not shown
 * together, because two live rates for one bank invite picking the flattering
 * one.
 *
 * Refuses a malformed report rather than skipping it: a bank that quietly
 * disappears from the comparison looks the same as a bank that has no offer,
 * and only one of those means somebody should go and look again.
 */
export function loadRateReports(root: string): RateReport[] {
  const directory = join(root, 'rates');
  if (!existsSync(directory)) return [];

  const newest = new Map<string, RateReport>();

  for (const file of readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .sort(byCodePoint)) {
    const path = join(directory, file);
    const data: unknown = JSON.parse(readFileSync(path, 'utf8'));

    try {
      assertValid('rate-report', data);
    } catch (error) {
      throw new Error(`${path}: ${error instanceof Error ? error.message : String(error)}`, {
        cause: error,
      });
    }

    // An unmarked bank is conventional, which is the common case. Spread first
    // so a report that does state its kind keeps it.
    const parsed = data as RateReport;
    const report: RateReport = { ...parsed, kind: parsed.kind ?? 'faiz' };
    // Ordered by the finest timestamp each report carries. Without this two
    // readings of one bank on one day are indistinguishable, and a mistake found
    // in the afternoon cannot supersede the morning's file.
    const previous = newest.get(report.bank);
    if (previous === undefined || readAt(previous) <= readAt(report)) {
      newest.set(report.bank, report);
    }
  }

  // Cheapest first: "who is cheapest today" is the question being asked. A bank
  // with nothing on offer sorts last rather than vanishing.
  return [...newest.values()].sort((a, b) => {
    const left = bestOffer(a)?.monthly_rate ?? Number.POSITIVE_INFINITY;
    const right = bestOffer(b)?.monthly_rate ?? Number.POSITIVE_INFINITY;
    return left === right ? byCodePoint(a.bank, b.bank) : left - right;
  });
}
