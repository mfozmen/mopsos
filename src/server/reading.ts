import type { ShownMarketReport } from '../market/load.js';

/**
 * The one file a request is allowed to read, or nothing.
 *
 * An allowlist, not a sanitiser. The set of readable files is known exactly —
 * the loader has just read every one of them — so there is nothing to reason
 * about: either the name is in that set or the request does not get an answer.
 * Sanitising a path means predicting every way a path can be written, and the
 * record is on the same disk as `.env`.
 */
export function readingFile(asked: string | undefined, known: string[]): string | undefined {
  if (asked === undefined || asked.length === 0) return undefined;

  return known.includes(asked) ? asked : undefined;
}

/**
 * The reading a request named, or nothing.
 *
 * The allowlist and the lookup are one step on purpose. Two steps is an API
 * where a caller can do the second without the first, and the first is what
 * keeps a request from naming a file the record does not hold — on a disk that
 * also holds `.env`.
 *
 * Superseded readings are findable. Looking at what was corrected is a thing
 * this record exists to allow; what it must not do is arrive unlabelled, and
 * the reading itself carries that label.
 */
export function findReading(
  reports: ShownMarketReport[],
  asked: string | undefined,
): ShownMarketReport | undefined {
  const every = reports.flatMap((report) => [report, ...report.earlier]);
  const wanted = readingFile(
    asked,
    every.map((report) => report.file),
  );

  return wanted === undefined ? undefined : every.find((report) => report.file === wanted);
}
