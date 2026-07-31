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

/** A reading of a bank taken before the one on show. */
export interface EarlierReading {
  report: RateReport;
  /**
   * True when a later reading replaced this one because it was wrong.
   *
   * A correction is not a movement. Listed unmarked beside a genuine earlier
   * reading it reads as the rate having changed, which invents a market move
   * out of a mistake — one of this record's corrections exists only because a
   * bank name was spelled with a dotless ı, and nothing about the rate moved.
   */
  corrected: boolean;
  /**
   * The note on the reading that replaced this one, where it wrote one.
   *
   * Named for what it is rather than for what it usually contains. Every
   * correction in this record explains itself there, so leaving it in the file
   * means the only way to learn why a reading was retired is to open the JSON —
   * which is what made this history unreadable. But `note` is a general remark
   * field, and a scout is free to write something else in it; presenting it as
   * "the reason" would put an explanation in the record's mouth.
   */
  replacementNote?: string;
}

/**
 * The reading on show, with the ones it stands in front of.
 *
 * Every reading is written and, until this existed, only the newest was
 * readable — the record kept a history it could not answer questions from.
 */
export interface ShownRateReport extends RateReport {
  /** Newest first, because "what did it say last time" is the question asked. */
  earlier: EarlierReading[];
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

/**
 * Does the cheapest-sounding offer in the record really cost the most?
 *
 * It does today — the prepaid-interest product with the lowest headline is the
 * dearest thing on the page — and that fact is the table's reason to exist. But
 * it is a fact about this reading, not a law, and a bank publishing an honest
 * %1,99 tomorrow would leave the page asserting something false. So the page
 * asks the record rather than repeating what was true when the prose was
 * written. Unmeasured offers are not an answer: comparing a known cost to an
 * unknown one proves nothing either way.
 */
export function headlineMisleads(reports: RateReport[]): boolean {
  const measured = reports
    .map((report) => {
      const offer = bestOffer(report);
      const real = offer === undefined ? undefined : trueMonthlyRate(offer);
      return real === undefined ? undefined : { headline: offer!.monthly_rate, real };
    })
    .filter((entry) => entry !== undefined);

  if (measured.length < 2) return false;

  const cheapestSounding = Math.min(...measured.map((entry) => entry.headline));
  const dearest = Math.max(...measured.map((entry) => entry.real));
  return measured.some((entry) => entry.headline === cheapestSounding && entry.real === dearest);
}

/**
 * The offer a bank is judged by: the one that really costs least.
 *
 * Not the one called least. Akbank's %1,99 is a prepaid-interest product that
 * really costs %3,32, and another of its own offers costs less — so picking on
 * the headline shows the reader the wrong product from the right bank.
 *
 * One function for both the row and its position, because they have to be the
 * same offer. Taking the minimum real cost across all offers while displaying
 * the lowest-headline one sorts on a figure the reader cannot see, and where
 * the displayed offer has no example, the table would sort a bank as measured
 * and print a dash for it.
 *
 * An offer with no real cost never wins against one that has it. Unknown is
 * never lower than the headline, so the unmeasured one may well be dearer, and
 * a guess does not belong in the row. Among unmeasured offers the headline is
 * the only figure there is.
 */
export function bestOffer(report: RateReport): RateOffer | undefined {
  const measured = report.offers
    .map((offer) => ({ offer, real: trueMonthlyRate(offer) }))
    .filter((entry): entry is { offer: RateOffer; real: number } => entry.real !== undefined)
    .sort((a, b) => a.real - b.real);

  return (
    measured[0]?.offer ?? [...report.offers].sort((a, b) => a.monthly_rate - b.monthly_rate)[0]
  );
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
export function loadRateReports(root: string): ShownRateReport[] {
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
  const byFile = new Map<string, RateReport>();
  const readingsByBank = new Map<string, { report: RateReport; file: string }[]>();
  // Which bank a corrected file belongs under. Not its own bank field: the case
  // corrections exist for is the name being wrong, so the reading it replaced
  // is filed under the spelling that replaced it.
  const correctedBy = new Map<string, { bank: string; note?: string }>();

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

    byFile.set(file, report);
    readingsByBank.set(report.bank, [...(readingsByBank.get(report.bank) ?? []), { report, file }]);

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

  for (const report of byFile.values()) {
    if (report.supersedes !== undefined && replaced.has(report.supersedes)) {
      correctedBy.set(report.supersedes, {
        bank: report.bank,
        ...(report.note === undefined ? {} : { note: report.note }),
      });
    }
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
    .map((kept) => ({ ...kept.report, earlier: earlierThan(kept) }))
    .sort((a, b) => byRealCost(a, b) || byHeadline(a, b) || byCodePoint(a.bank, b.bank));

  function earlierThan(kept: { report: RateReport; file: string }): EarlierReading[] {
    const own = (readingsByBank.get(kept.report.bank) ?? []).filter(
      (reading) => reading.file !== kept.file && !replaced.has(reading.file),
    );
    const corrections = [...byFile.entries()]
      .filter(([file]) => correctedBy.get(file)?.bank === kept.report.bank)
      .map(([file, report]) => ({ report, file }));

    return [...own, ...corrections]
      .map((reading) => {
        const replacementNote = correctedBy.get(reading.file)?.note;
        return {
          report: reading.report,
          corrected: replaced.has(reading.file),
          ...(replacementNote === undefined ? {} : { replacementNote }),
        };
      })
      .sort((a, b) => byCodePoint(readAt(b.report), readAt(a.report)));
  }
}

/**
 * What the report's best offer really costs, or nothing when it cannot be known.
 *
 * Read from the same offer the table shows. A minimum taken across every offer
 * would rank a bank on a figure that appears nowhere on its row.
 */
function realCost(report: RateReport): number | undefined {
  const best = bestOffer(report);
  return best === undefined ? undefined : trueMonthlyRate(best);
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
