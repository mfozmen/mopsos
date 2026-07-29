import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { byCodePoint } from '../order.js';
import { readAt } from '../record/read-at.js';
import { assertValid } from '../schema/validate.js';

/** Whether the teslimat date is owed or merely expected. */
export type DeliveryBasis = 'contractual' | 'indicative';

export interface SavingsPlan {
  product: string;
  /** Finansman tutarı: what the firm hands over when your turn comes. */
  amount_financed: number;
  /** The firm's own toplam ödenecek tutar, copied rather than summed. */
  total_payable: number;
  /** Organizasyon ücreti in lira. The only charge these firms may make. */
  organisation_fee?: number;
  /** The same fee as the percentage the firm quotes it at. 9 means %9. */
  organisation_fee_rate?: number;
  down_payment?: number;
  /** Peşinat as a percentage of the amount financed. 20 means %20. */
  down_payment_ratio?: number;
  /** Tasarruf dönemi and finansman dönemi together. */
  term_months: number;
  /** Teslimat süresi: months from signing until the money is handed over. */
  delivery_after_months: number;
  delivery_basis: DeliveryBasis;
  conditions?: string;
}

export interface SavingsFinanceReport {
  schema_version: 1;
  provider: string;
  captured_on: string;
  /** To the minute, when recorded. Present only on readings that need ordering within a day. */
  captured_at?: string;
  /** The file this reading replaces, when it is a correction. */
  supersedes?: string;
  source_url: string;
  plans: SavingsPlan[];
  note?: string;
  /** What the scout makes of its own figures. Opinion, kept apart from the data. */
  reading?: string;
}

/**
 * Reads the savings finance reports, newest reading per firm.
 *
 * Older readings stay on disk — the record is append-only, and what a firm was
 * charging last month is evidence of where the product went. They are not shown
 * together, because two live readings for one firm invite picking whichever one
 * makes the case.
 *
 * Refuses a malformed report rather than skipping it: a firm that quietly
 * disappears from the list looks the same as a firm with nothing on offer, and
 * only one of those means somebody should go and look again.
 */
export function loadSavingsFinanceReports(root: string): SavingsFinanceReport[] {
  const directory = join(root, 'savings');
  if (!existsSync(directory)) return [];

  const newest = new Map<string, { report: SavingsFinanceReport; file: string }>();
  const readAtByFile = new Map<string, number>();
  const claims: { supersedes: string; at: number }[] = [];
  const replaced = new Set<string>();

  // Read first, then decide. A correction says which file it replaces, and that
  // is the only thing that reliably identifies it: newest-per-firm keys on the
  // firm's name, and one firm trades under more spellings than it has names.
  for (const file of readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .sort(byCodePoint)) {
    const path = join(directory, file);
    const data: unknown = JSON.parse(readFileSync(path, 'utf8'));

    try {
      assertValid('savings-finance-report', data);
    } catch (error) {
      throw new Error(`${path}: ${error instanceof Error ? error.message : String(error)}`, {
        cause: error,
      });
    }

    const report = data as SavingsFinanceReport;
    const at = readAt(report);
    readAtByFile.set(file, at);
    if (report.supersedes !== undefined) claims.push({ supersedes: report.supersedes, at });

    const previous = newest.get(report.provider);
    if (previous === undefined || readAt(previous.report) <= at) {
      newest.set(report.provider, { report, file });
    }
  }

  // Only a later reading may retire an earlier one. A correction is written
  // after the thing it corrects, so a file claiming to replace something newer
  // than itself has its history backwards — and honouring it would delete the
  // right reading and keep the wrong one.
  //
  // A supersedes pointing at nothing is ignored rather than honoured: a typo
  // there must not make the report itself vanish.
  for (const claim of claims) {
    const target = readAtByFile.get(claim.supersedes);
    if (target !== undefined && target <= claim.at) replaced.add(claim.supersedes);
  }

  for (const [provider, kept] of newest) {
    if (replaced.has(kept.file)) newest.delete(provider);
  }

  // By name, not by price. There is no column to rank on: the firm with the
  // smaller organisation fee is regularly the one with the longer wait, and
  // sorting on either would name a winner the figures do not name. Ranking is
  // the reader's to do, against the wait they are willing to accept.
  return [...newest.values()]
    .map((kept) => kept.report)
    .sort((a, b) => byCodePoint(a.provider, b.provider));
}
