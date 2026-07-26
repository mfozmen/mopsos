import type { SnapshotObservation, SnapshotSource } from './source.js';

/**
 * The documented column order. Fixed rather than inferred from the header: a
 * file that arrives with columns in a different order is a file someone changed,
 * and guessing would let it through with the values swapped.
 */
const COLUMNS = ['basket_id', 'observed_on', 'listing_count', 'median_price_per_m2'] as const;

const HEADER = COLUMNS.join(',');
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function positiveNumber(value: string, column: string, line: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`line ${line}: ${column} must be a number of zero or more, got "${value}"`);
  }
  return parsed;
}

/**
 * Reads snapshot observations from CSV.
 *
 * Rejects the whole file rather than skipping a bad row. A snapshot series is
 * never corrected retroactively, so a row that quietly fails to import is a hole
 * that cannot be filled later — by then the listings it described are gone.
 */
export function parseSnapshotCsv(text: string): SnapshotObservation[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const [header, ...rows] = lines;

  if (header?.trim() !== HEADER) {
    throw new Error(`unexpected header: expected "${HEADER}", got "${header ?? ''}"`);
  }

  const observations: SnapshotObservation[] = [];
  const seen = new Set<string>();

  rows.forEach((row, index) => {
    const line = index + 2; // 1-indexed, and the header is line 1
    const cells = row.split(',').map((cell) => cell.trim());

    if (cells.length !== COLUMNS.length) {
      throw new Error(`line ${line}: expected ${COLUMNS.length} columns, got ${cells.length}`);
    }

    const [basketId = '', observedOn = '', listingCount = '', medianPrice = ''] = cells;

    if (basketId.length === 0) {
      throw new Error(`line ${line}: basket_id is empty`);
    }

    if (!ISO_DAY.test(observedOn)) {
      throw new Error(`line ${line}: observed_on must be YYYY-MM-DD, got "${observedOn}"`);
    }

    // One reading per basket per day. Two are a conflict to resolve now, while
    // whoever produced the file still remembers — not something to pick between
    // silently, which is how the series would start disagreeing with itself.
    const key = `${basketId}@${observedOn}`;
    if (seen.has(key)) {
      throw new Error(`line ${line}: ${basketId} already has an observation for ${observedOn}`);
    }
    seen.add(key);

    observations.push({
      basket_id: basketId,
      observed_on: observedOn,
      listing_count: positiveNumber(listingCount, 'listing_count', line),
      median_price_per_m2: positiveNumber(medianPrice, 'median_price_per_m2', line),
    });
  });

  return observations;
}

/**
 * The first `SnapshotSource`: a CSV fed by hand or half by hand.
 *
 * It works on day one, which matters more here than elegance — listing sites
 * keep no archive, so every week without collection is a week that can never be
 * recovered. How the file gets produced is deliberately not decided here.
 */
export function csvSnapshotSource(id: string, text: string): SnapshotSource {
  return {
    id,
    reliability: 'self_collected',
    read: () => parseSnapshotCsv(text),
  };
}
