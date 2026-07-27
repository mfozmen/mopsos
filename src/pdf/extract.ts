import { extractText, getDocumentProxy } from 'unpdf';

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
    // verbosity 0: pdf.js otherwise warns about a `Math.sumPrecise` it cannot
    // find on Node 22, which nobody can act on and which trains people to ignore
    // warnings.
    const document = await getDocumentProxy(bytes, { verbosity: 0 });
    ({ text: pages } = await extractText(document, { mergePages: false }));
  } catch (error) {
    throw new NotAPdfError(error);
  }

  return { pages, hasTextLayer: pages.some((page) => page.trim().length > 0) };
}
