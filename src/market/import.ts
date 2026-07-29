import { parseTurkishNumber } from '../finance/format.js';
import type { MarketNeighbourhood, MarketReport } from './load.js';

export class InvalidListingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidListingsError';
  }
}

export interface Basket {
  province: string;
  district: string;
  capturedOn: string;
  /** What was measured: site, room count, size band, date. The whole basket. */
  source: string;
}

/** Below this a median is noise wearing a number's clothes. */
const THIN = 10;

/**
 * Splits a CSV line, honouring quotes.
 *
 * Turkish prices get pasted as `"4.750.000"`, where the quotes are what stop
 * the thousands separators from looking like fields.
 */
function cells(line: string): string[] {
  return (line.match(/("[^"]*"|[^,]*)(,|$)/g) ?? [])
    .map((cell) => cell.replace(/,$/, '').trim().replace(/^"|"$/g, ''))
    .slice(0, -1);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

/**
 * Turns listings a person collected by hand into the report a scout would write.
 *
 * sahibinden permits this in `robots.txt` and refuses it in practice — one
 * ordinary request to a district page comes back "Olağandışı bir durum tespit
 * ettik" with a support code. Being refused is a finding; getting past a
 * refusal is somebody else's problem to have. A browser a person is sitting at
 * is not refused, so the source arrives through them.
 *
 * The output is a market report and nothing else: same schema, same file, same
 * append-only rules, so a hand-collected reading merges with a scouted one
 * instead of becoming a second kind of truth.
 *
 * Confidence never reaches `high` here, whatever the count. High means
 * cross-checked against a second source, and this is one source by definition.
 */
export function listingsToReport(csv: string, basket: Basket): MarketReport {
  const lines = csv
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(1);

  if (lines.length === 0) {
    throw new InvalidListingsError('Dosyada başlık dışında satır yok');
  }

  const perNeighbourhood = new Map<string, number[]>();

  for (const line of lines) {
    const [name = '', size = '', price = ''] = cells(line);
    const squareMetres = parseTurkishNumber(size);
    const asking = parseTurkishNumber(price);

    // Refused rather than skipped: a dropped row is a median computed over data
    // nobody knows is missing, which is the failure this whole record exists to
    // avoid.
    if (name.length === 0 || !Number.isFinite(squareMetres) || squareMetres <= 0) {
      throw new InvalidListingsError(`Okunamayan satır (m² eksik ya da geçersiz): ${line}`);
    }
    if (!Number.isFinite(asking) || asking <= 0) {
      throw new InvalidListingsError(`Okunamayan satır (fiyat geçersiz): ${line}`);
    }

    perNeighbourhood.set(name, [...(perNeighbourhood.get(name) ?? []), asking / squareMetres]);
  }

  const neighbourhoods: MarketNeighbourhood[] = [...perNeighbourhood.entries()]
    .map(([name, rates]) => ({
      name,
      // The median of the per-square-metre ratios, not the median price over the
      // median size — those are different numbers and only one of them is a
      // price per square metre.
      sale_per_m2: Math.round(median(rates)),
      listing_count: rates.length,
      basis: 'listing_median' as const,
      confidence: rates.length < THIN ? ('low' as const) : ('medium' as const),
      source: basket.source,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'));

  return {
    schema_version: 1,
    province: basket.province,
    district: basket.district,
    captured_on: basket.capturedOn,
    neighbourhoods,
  };
}
