import { describe, expect, it } from 'vitest';

import { csvSnapshotSource, parseSnapshotCsv } from './csv.js';

const HEADER = 'basket_id,observed_on,listing_count,median_price_per_m2';
const ROW = 'menemen-3plus1-100to130,2026-07-26,142,48500';

function csv(...rows: string[]): string {
  return [HEADER, ...rows].join('\n');
}

function message(text: string): string {
  try {
    parseSnapshotCsv(text);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('expected the file to be rejected, but it was accepted');
}

describe('parseSnapshotCsv', () => {
  it('reads an observation', () => {
    expect(parseSnapshotCsv(csv(ROW))).toEqual([
      {
        basket_id: 'menemen-3plus1-100to130',
        observed_on: '2026-07-26',
        listing_count: 142,
        median_price_per_m2: 48500,
      },
    ]);
  });

  it('reads several observations, including a second date for one basket', () => {
    const rows = parseSnapshotCsv(
      csv(
        ROW,
        'menemen-3plus1-100to130,2026-08-02,138,49100',
        'bornova-2plus1-70to90,2026-07-26,88,61000',
      ),
    );

    expect(rows).toHaveLength(3);
  });

  it('accepts a file with a trailing newline', () => {
    expect(parseSnapshotCsv(`${csv(ROW)}\n`)).toHaveLength(1);
  });

  it('reads nothing from a header with no rows', () => {
    expect(parseSnapshotCsv(HEADER)).toEqual([]);
  });
});

describe('rejections', () => {
  it('rejects a header that is not the documented one', () => {
    expect(message('basket,date,count,price\nx,2026-07-26,1,2')).toMatch(/header/i);
  });

  it('rejects a row with the wrong number of columns', () => {
    expect(message(csv('menemen-3plus1-100to130,2026-07-26,142'))).toMatch(/line 2/);
  });

  it('rejects a count that is not a number', () => {
    expect(message(csv('menemen-3plus1-100to130,2026-07-26,lots,48500'))).toMatch(/listing_count/);
  });

  it('rejects a negative price rather than storing it', () => {
    expect(message(csv('menemen-3plus1-100to130,2026-07-26,142,-1'))).toMatch(
      /median_price_per_m2/,
    );
  });

  it('rejects a date that is not an ISO day', () => {
    expect(message(csv('menemen-3plus1-100to130,26/07/2026,142,48500'))).toMatch(/observed_on/);
  });

  it('rejects the same basket observed twice on one day', () => {
    // The series is never corrected retroactively, so two readings of the same
    // day are a conflict to resolve now, not something to silently pick between.
    expect(message(csv(ROW, ROW))).toMatch(/already/i);
  });

  it('names the line, so the reader can fix the file', () => {
    expect(message(csv(ROW, 'broken'))).toMatch(/line 3/);
  });
});

describe('csvSnapshotSource', () => {
  it('reports itself as self-collected, not as official data', () => {
    // A listing price is not a transaction price. Anything reading this series
    // has to know it measures direction, not a price level.
    expect(csvSnapshotSource('manual-export', csv(ROW)).reliability).toBe('self_collected');
  });

  it('reads its observations', () => {
    expect(csvSnapshotSource('manual-export', csv(ROW)).read()).toHaveLength(1);
  });

  it('carries an id, so a series can say where it came from', () => {
    expect(csvSnapshotSource('manual-export', csv(ROW)).id).toBe('manual-export');
  });
});
