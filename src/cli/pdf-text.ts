/**
 * Prints the text of a PDF, from a local path or a URL.
 *
 * Exit codes: 0 text extracted, 1 no text layer (a scan), 2 unreadable.
 * A scan gets its own code because it is not a failure — it is a document that
 * needs reading with eyes instead, and the caller can branch on that.
 *
 * Usage: npm run pdf:text -- <path|url>
 */
import { resolveDataDir } from '../config/data-dir.js';
import { extractPdfText, NotAPdfError } from '../pdf/extract.js';
import { PdfFetchError } from '../pdf/fetch.js';
import { OutsideAllowedRootError, PdfReadError, readPdf } from '../pdf/read.js';

const target = process.argv[2];

if (target === undefined) {
  console.error('Usage: npm run pdf:text -- <path|url>');
  process.exit(2);
}

// This repository and the private data repository, and nothing else. The caller
// is usually a subagent building a path from a request.
const roots = [process.cwd()];
try {
  roots.push(resolveDataDir(process.cwd(), process.env));
} catch {
  // No data directory yet — the working tree alone is a fine allowed root.
}

try {
  const { pages, hasTextLayer } = await extractPdfText(await readPdf(target, roots));

  if (!hasTextLayer) {
    console.error(
      `${target} has no text layer — it is a scan or an image.\n` +
        `Read it by rendering the pages and looking at them instead.`,
    );
    process.exit(1);
  }

  pages.forEach((page, index) => {
    if (pages.length > 1) console.log(`\n--- page ${index + 1} of ${pages.length} ---\n`);
    console.log(page);
  });
} catch (error) {
  if (
    error instanceof PdfFetchError ||
    error instanceof OutsideAllowedRootError ||
    error instanceof PdfReadError ||
    error instanceof NotAPdfError
  ) {
    console.error(error.message);
    process.exit(2);
  }
  throw error;
}
