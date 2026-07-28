import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { byCodePoint } from '../order.js';
import { assertValid } from '../schema/validate.js';

export interface MarketNeighbourhood {
  name: string;
  sale_per_m2?: number;
  rent_per_m2?: number;
  listing_count: number;
  basis: 'listing_median' | 'official' | 'mixed';
  confidence: 'high' | 'medium' | 'low';
  source: string;
  source_url?: string;
  note?: string;
}

export interface MarketReport {
  schema_version: 1;
  province: string;
  district: string;
  captured_on: string;
  captured_at?: string;
  supersedes?: string;
  note?: string;
  neighbourhoods: MarketNeighbourhood[];
}

/** A neighbourhood as the interface shows it: the report's figures plus what follows from them. */
export interface ShownNeighbourhood extends MarketNeighbourhood {
  /** Annual gross rental yield, as a fraction. Derived, never recorded. */
  gross_yield?: number;
}

export interface ShownMarketReport {
  place: string;
  dated: string;
  neighbourhoods: ShownNeighbourhood[];
  note?: string;
}

/**
 * Twelve months of rent over the asking price.
 *
 * Worked out here rather than recorded, because it follows from two numbers
 * that are recorded and must not be able to disagree with them. An agent that
 * reports the price, the rent and the yield can report a yield that does not
 * follow from its own figures, and nothing downstream would catch it.
 *
 * Gross, and only ever indicative: it is rent asked over price asked, with no
 * vacancy, tax, dues or agent fee in it, and neither figure is a transaction.
 */
function grossYield(neighbourhood: MarketNeighbourhood): number | undefined {
  const { sale_per_m2: sale, rent_per_m2: rent } = neighbourhood;
  if (sale === undefined || rent === undefined) return undefined;

  return (rent * 12) / sale;
}

/** The finest timestamp a report carries. A date alone sorts as its first second. */
function readAt(report: MarketReport): string {
  return report.captured_at ?? `${report.captured_on}T00:00:00.000Z`;
}

/**
 * Reads the market reports, newest reading per district.
 *
 * Older readings stay on disk — that is the point of the record. Two months of
 * the same neighbourhood is the only way to answer "did it move", and listing
 * sites keep no archive, so a week not collected is a week gone for good.
 *
 * They are not shown together, because two live readings of one district invite
 * picking whichever one makes the case.
 *
 * A malformed report stops the load rather than being skipped. A neighbourhood
 * that quietly disappears looks exactly like one nobody has researched, and only
 * one of those means somebody should go and look.
 */
export function loadMarketReports(root: string): ShownMarketReport[] {
  const directory = join(root, 'market');
  if (!existsSync(directory)) return [];

  const newest = new Map<string, MarketReport>();

  for (const file of readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .sort(byCodePoint)) {
    const path = join(directory, file);
    const data: unknown = JSON.parse(readFileSync(path, 'utf8'));

    try {
      assertValid('market-report', data);
    } catch (error) {
      throw new Error(`${path}: ${error instanceof Error ? error.message : String(error)}`, {
        cause: error,
      });
    }

    const report = data as MarketReport;
    const place = `${report.province} / ${report.district}`;
    const previous = newest.get(place);
    if (previous === undefined || readAt(previous) <= readAt(report)) {
      newest.set(place, report);
    }
  }

  return [...newest.entries()]
    .sort(([left], [right]) => byCodePoint(left, right))
    .map(([place, report]) => ({
      place,
      dated: report.captured_on,
      ...(report.note === undefined ? {} : { note: report.note }),
      neighbourhoods: report.neighbourhoods.map((neighbourhood) => {
        const yield_ = grossYield(neighbourhood);
        return { ...neighbourhood, ...(yield_ === undefined ? {} : { gross_yield: yield_ }) };
      }),
    }));
}
