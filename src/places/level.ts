/**
 * Where a figure sits, and what that place can honestly be measured with.
 *
 * The three levels are not the same kind of data and must not be modelled as
 * though they were. A province has an official, calendar-published index. A
 * district is measured partly officially and partly from listings. A
 * neighbourhood exists only in what we collect ourselves, and no institution
 * publishes anything about it at all.
 *
 * Flattened into one "place", a mahalle median would be citable the way a TCMB
 * series is, and on the page the two would look identical.
 */
export type Level = 'province' | 'district' | 'neighbourhood';

/** The source vocabulary the schemas already use. */
import type { Reliability } from '../snapshots/source.js';

export type Source = 'evds' | 'tuik' | 'listing_snapshot' | 'market_close';

export type { Reliability } from '../snapshots/source.js';

export interface Place {
  /**
   * The names as written, joined. Stable, and no transliteration anywhere.
   *
   * A slug would fold "Çiğli" and a hypothetical "Cigli" onto one identity, and
   * the record would then hold two districts under one name with no way to tell
   * them apart — which is the same failure that once put two live rates for one
   * bank in the rates table.
   */
  id: string;
  name: string;
  level: Level;
  /** The names above this one, outermost first. Empty for a province. */
  within: string[];
}

const LEVELS: Level[] = ['province', 'district', 'neighbourhood'];

const SOURCES: Record<Level, Source[]> = {
  // TCMB's house price index and TÜİK's sales counts both publish at this level.
  province: ['evds', 'tuik'],
  // TÜİK counts sales by district; prices at this level come from listings.
  district: ['tuik', 'listing_snapshot'],
  // Nobody publishes anything about a mahalle. If we did not collect it, it
  // does not exist — which is why the snapshot job cannot wait for a seer.
  neighbourhood: ['listing_snapshot'],
};

const RELIABILITY: Record<Level, Reliability> = {
  province: 'official',
  district: 'mixed',
  neighbourhood: 'self_collected',
};

/** A place, named from the outside in: province, then district, then mahalle. */
export function at(...names: string[]): Place {
  const name = names.at(-1);
  const level = LEVELS[names.length - 1];
  if (name === undefined || level === undefined) {
    throw new Error(`a place is one to three names, got ${String(names.length)}`);
  }

  return { id: names.join(' / '), name, level, within: names.slice(0, -1) };
}

/** The place this one sits in, or nothing when it is a province. */
export function parentOf(place: Place | undefined): Place | undefined {
  return place === undefined || place.within.length === 0 ? undefined : at(...place.within);
}

export function sourcesFor(level: Level): Source[] {
  return [...SOURCES[level]];
}

export function reliabilityOf(level: Level): Reliability {
  return RELIABILITY[level];
}

/**
 * Whether a level can be measured with a source at all.
 *
 * The rejection is the point. A verdict citing EVDS for a mahalle is citing a
 * figure that was never published, and it would sit on the page looking like
 * the most solid number there.
 */
export function allowsSource(level: Level, source: Source): boolean {
  return SOURCES[level].includes(source);
}
