/** One thing in the record a reader might be looking for again. */
export interface Searchable {
  kind: 'market' | 'rates';
  /** What it is: a place, or a bank. */
  title: string;
  dated: string;
  /**
   * Everything worth matching on, names and prose together.
   *
   * The prose matters most. The sentence a reader wants to find again is
   * usually the one a scout wrote about where it stopped — "sahibinden refused
   * the list after the fourteenth page", "the sale band is 3+1-heavy while the
   * rent band is not" — and none of that is a name.
   */
  text: string;
}

const TURKISH: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' };

/**
 * A word reduced to what a keyboard makes easy.
 *
 * Turkish has two i's — dotted and dotless — and a phone keyboard produces the
 * wrong one about half the time. `toLowerCase` alone does not help: it maps
 * `I` to `i` and `İ` to `i̇`, so "İzmir" and "izmir" stay different strings. A
 * search that keeps the distinction fails on the first word anyone types.
 */
export function fold(value: string): string {
  // Lowercased with the Turkish locale first, which is the half that has to
  // happen in the right order: it maps I to ı and İ to i, and only then does
  // stripping the diacritics give one letter for both.
  return [...value.toLocaleLowerCase('tr')].map((letter) => TURKISH[letter] ?? letter).join('');
}

/**
 * Whether an entry answers a query.
 *
 * Every word must match, so a second word narrows rather than widens — which is
 * what a reader means when they add one. An empty query is no filter at all,
 * not a filter nothing passes.
 */
export function matches(entry: Searchable, query: string): boolean {
  const haystack = fold(`${entry.title} ${entry.text}`);

  return fold(query)
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .every((word) => haystack.includes(word));
}

/** What a market reading offers to a search: its place, its figures, its prose. */
interface ReadPlace {
  place: string;
  dated: string;
  note?: string;
  reading?: string;
  neighbourhoods: { name: string; source: string }[];
}

/** What a rate reading offers: the bank, and what it called each product. */
interface ReadBank {
  bank: string;
  captured_on: string;
  note?: string;
  offers: { product: string; conditions?: string }[];
}

/**
 * Everything in the record that can be looked for again, newest first.
 *
 * One list across both kinds rather than a search per record type. A reader
 * looking for something remembered does not first decide whether it was a bank
 * or a district — they remember a word.
 *
 * Newest first because a hit with no date is a hit nobody can use, and an old
 * reading above a new one is the same problem one step later.
 */
export function searchable(places: ReadPlace[], banks: ReadBank[]): Searchable[] {
  const fromPlaces = places.map((report) => ({
    kind: 'market' as const,
    title: report.place,
    dated: report.dated,
    text: [
      report.note ?? '',
      report.reading ?? '',
      ...report.neighbourhoods.map((n) => `${n.name} ${n.source}`),
    ].join(' '),
  }));

  const fromBanks = banks.map((report) => ({
    kind: 'rates' as const,
    title: report.bank,
    dated: report.captured_on,
    text: [
      report.note ?? '',
      ...report.offers.map((offer) => `${offer.product} ${offer.conditions ?? ''}`),
    ].join(' '),
  }));

  return [...fromPlaces, ...fromBanks].sort((a, b) => (a.dated < b.dated ? 1 : -1));
}
