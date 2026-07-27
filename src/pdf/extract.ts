import { extractText, getDocumentProxy } from 'unpdf';

/**
 * pdf.js reaches for `Math.sumPrecise`, which Node 22 does not have, and warns
 * once per document without it. Ordinary summation is accurate enough for glyph
 * positioning, and a warning nobody can act on trains people to ignore warnings.
 */
declare global {
  interface Math {
    sumPrecise?: (values: Iterable<number>) => number;
  }
}
Math.sumPrecise ??= (values) => {
  let total = 0;
  for (const value of values) total += value;
  return total;
};

export class NotAPdfError extends Error {
  constructor(cause: unknown) {
    super('Not a PDF, or the file is damaged beyond what pdf.js can rebuild');
    this.name = 'NotAPdfError';
    this.cause = cause;
  }
}

export interface PdfText {
  /** One entry per page, in order. */
  pages: string[];
  /**
   * False when the document carries no text at all — a scan.
   *
   * Reported rather than thrown, because a scan is a normal thing to meet: the
   * caller falls back to reading a rendered image. What it must never do is
   * treat empty text as a document that says nothing.
   */
  hasTextLayer: boolean;
}

/** Reads the text layer of a PDF. */
export async function extractPdfText(bytes: Uint8Array): Promise<PdfText> {
  let pages: string[];

  try {
    const document = await getDocumentProxy(bytes);
    ({ text: pages } = await extractText(document, { mergePages: false }));
  } catch (error) {
    throw new NotAPdfError(error);
  }

  return { pages, hasTextLayer: pages.some((page) => page.trim().length > 0) };
}
