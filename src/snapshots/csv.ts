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
  // The empty check comes first because Number('') is 0, and a blank cell is a
  // gap in the data, not a measurement of zero. Recorded as zero it would
  // corrupt a series that is never rewritten.
  const parsed = value.length === 0 ? Number.NaN : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`line ${line}: ${column} must be a number of zero or more, got "${value}"`);
  }
  return parsed;
}

/**
 * A real calendar day, not merely something shaped like one.
 *
 * `2026-02-30` matches the pattern and does not exist. These dates are entered
 * by hand onto a series that is never corrected, so the moment to catch that is
 * now.
 */
function isRealDay(value: string): boolean {
  if (!ISO_DAY.test(value)) return false;

  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * Reads snapshot observations from CSV.
 *
 * Rejects the whole file rather than skipping a bad row. A snapshot series is
 * never corrected retroactively, so a row that quietly fails to import is a hole
 * that cannot be filled later — by then the listings it described are gone.
 */
export function parseSnapshotCsv(text: string): SnapshotObservation[] {
  // Blank lines are kept, not filtered, so a reported line number matches what
  // the reader sees in their editor. They are skipped inside the loop instead.
  const [header, ...rows] = text.split(/\r?\n/);

  if (header?.trim() !== HEADER) {
    throw new Error(`unexpected header: expected "${HEADER}", got "${header ?? ''}"`);
  }

  const observations: SnapshotObservation[] = [];
  const seen = new Set<string>();

  rows.forEach((row, index) => {
    const line = index + 2; // 1-indexed, and the header is line 1
    if (row.trim().length === 0) return;

    const cells = row.split(',').map((cell) => cell.trim());

    if (cells.length !== COLUMNS.length) {
      throw new Error(`line ${line}: expected ${COLUMNS.length} columns, got ${cells.length}`);
    }

    const [basketId = '', observedOn = '', listingCount = '', medianPrice = ''] = cells;

    if (basketId.length === 0) {
      throw new Error(`line ${line}: basket_id is empty`);
    }

    if (!isRealDay(observedOn)) {
      throw new Error(
        `line ${line}: observed_on must be a real YYYY-MM-DD day, got "${observedOn}"`,
      );
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
