/**
 * Prints the text of a PDF, from a local path or a URL.
 *
 * Exit codes: 0 text extracted, 1 no text layer (a scan), 2 not a PDF.
 * A scan gets its own code because it is not a failure — it is a document that
 * needs reading with eyes instead, and the caller can branch on that.
 *
 * Usage: npm run pdf:text -- <path|url>
 */
import { readFileSync } from 'node:fs';

import { extractPdfText, NotAPdfError } from '../pdf/extract.js';
import { fetchPdf, PdfFetchError } from '../pdf/fetch.js';

const target = process.argv[2];

if (target === undefined) {
  console.error('Usage: npm run pdf:text -- <path|url>');
  process.exit(2);
}

async function read(source: string): Promise<Uint8Array> {
  if (!/^https?:\/\//.test(source)) return new Uint8Array(readFileSync(source));
  return fetchPdf(source);
}

try {
  const { pages, hasTextLayer } = await extractPdfText(await read(target));

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
  if (error instanceof PdfFetchError) {
    console.error(error.message);
    process.exit(2);
  }
  if (error instanceof NotAPdfError) {
    console.error(`${target}: ${error.message}`);
    process.exit(2);
  }
  throw error;
}
