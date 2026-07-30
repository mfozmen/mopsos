import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  annualCostRate,
  effectiveMonthlyRate,
  IncalculableCostError,
} from '../finance/effective.js';
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

/**
 * How far our annual cost rate may sit BELOW the bank's own before the example
 * is treated as incomplete, in percentage points.
 *
 * Loose enough to absorb rounding in a published figure — the four banks that
 * publish both agree to four decimals, so this is pure headroom — and tight
 * enough to catch a missing charge: leaving out VakıfBank's 33.000 TL of fees
 * moves the annual rate by nearly four points.
 */
const TOLERANCE = 0.5;

/**
 * How far ABOVE the bank's own figure ours may sit before it is our mistake
 * rather than their formula, in percentage points.
 *
 * The one-sided rule reads "above" as the bank's arithmetic not reconciling
 * with its own cashflow, which is what Yapı Kredi's does — by 0,7 points. That
 * is not a licence for any gap at all. A fee entered twice or a decimal point
 * moved lands far outside anything a formula disagreement produces, and it
 * lands on the side that looks conservative, where nothing else would question
 * it. Ten points is wider than every disagreement seen so far by an order of
 * magnitude and narrower than any of those mistakes.
 */
const OVERSTATEMENT_LIMIT = 10;

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

  let monthly: number;
  try {
    monthly = effectiveMonthlyRate({
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

  // Where the bank publishes its own yıllık maliyet oranı, that figure is a
  // checksum rather than decoration: it was computed from the same cashflow, by
  // the party that knows every charge in it.
  //
  // The check is **one-sided**, because the two directions do not mean the same
  // thing. Coming out BELOW the published figure means our example is short of a
  // charge — Ziraat's was short of its fees, giving %45,76 against a published
  // %47,29 — and a rate we can see is understated is worse than no rate at all:
  // it is the same mistake as the headline, arrived at more convincingly.
  //
  // Coming out ABOVE it means the bank's own formula does not reconcile with its
  // own cashflow, and that ours is the conservative number. Yapı Kredi prints
  // %41,6431 where its published instalment and its published fees give %42,35,
  // and the fee implied by its formula drifts by five thousand lira across terms
  // while its printed fee does not move. Suppressing that would hide a figure we
  // trust in favour of nothing at all.
  const published = example.published_annual_cost_rate;
  if (published !== undefined) {
    const ours = annualCostRate(monthly) * 100;
    if (ours < published - TOLERANCE) return undefined;
    if (ours > published + OVERSTATEMENT_LIMIT) return undefined;
  }

  return monthly;
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

  const newest = new Map<string, { report: RateReport; file: string }>();
  const files = readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .sort(byCodePoint);

  // Read first, then decide. A correction says which file it replaces, and that
  // is the only thing that reliably identifies it: newest-per-bank keys on the
  // bank's name, and "VakifBank" and "VakıfBank" are two different names for
  // one bank — which is how two live rates for it once sat in the table at
  // once, the exact invitation to pick the flattering one that keying by name
  // is meant to prevent.
  //
  // A supersedes pointing at nothing is ignored rather than honoured: a typo
  // there must not make the report itself vanish, because a bank that quietly
  // disappears looks the same as a bank nobody checked.
  const readAtByFile = new Map<string, string>();
  const claims: { supersedes: string; at: string }[] = [];
  const replaced = new Set<string>();

  for (const file of files) {
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
    readAtByFile.set(file, readAt(report));
    if (report.supersedes !== undefined) {
      claims.push({ supersedes: report.supersedes, at: readAt(report) });
    }

    const previous = newest.get(report.bank);
    if (previous === undefined || readAt(previous.report) <= readAt(report)) {
      newest.set(report.bank, { report, file });
    }
  }

  // Only a later reading may retire an earlier one. A correction is written
  // after the thing it corrects, so a file claiming to replace something newer
  // than itself has its history backwards — and honouring it would delete the
  // right reading and keep the wrong one, which is the opposite of the job.
  for (const claim of claims) {
    const target = readAtByFile.get(claim.supersedes);
    if (target !== undefined && target <= claim.at) replaced.add(claim.supersedes);
  }

  for (const [bank, kept] of newest) {
    if (replaced.has(kept.file)) newest.delete(bank);
  }

  // Cheapest first, on what an offer really costs rather than on what it is
  // called. That distinction is the whole record: Akbank's %1,99 is a
  // prepaid-interest product that really costs %3,32, and Halkbank's %2,60
  // really costs %2,72 — so a list ordered on the headline puts the dearer one
  // first, which is the mistake this was all built to correct.
  //
  // A bank whose real cost cannot be known ranks below every bank whose can. No
  // example means the cost is unknown and higher than the headline, never lower,
  // so seating it by that headline would put an unknown above measured ones.
  // Among themselves the unknowns keep headline order, which is the only figure
  // they have.
  return [...newest.values()]
    .map((kept) => kept.report)
    .sort((a, b) => byRealCost(a, b) || byHeadline(a, b) || byCodePoint(a.bank, b.bank));
}

/** The cheapest real cost a report carries, or nothing when none can be computed. */
function realCost(report: RateReport): number | undefined {
  const costs = report.offers.flatMap((offer) => {
    const real = trueMonthlyRate(offer);
    return real === undefined ? [] : [real];
  });

  return costs.length === 0 ? undefined : Math.min(...costs);
}

function byRealCost(a: RateReport, b: RateReport): number {
  const left = realCost(a);
  const right = realCost(b);

  if (left === undefined && right === undefined) return 0;
  if (left === undefined) return 1;
  if (right === undefined) return -1;

  return left - right;
}

function byHeadline(a: RateReport, b: RateReport): number {
  const left = bestOffer(a)?.monthly_rate ?? Number.POSITIVE_INFINITY;
  const right = bestOffer(b)?.monthly_rate ?? Number.POSITIVE_INFINITY;

  return left - right;
}
