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
