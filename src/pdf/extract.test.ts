import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { extractPdfText, NotAPdfError } from './extract.js';

const SOURCES = join(dirname(fileURLToPath(import.meta.url)), '../../data/sources');

/** A structurally valid PDF with one page and no text operators — like a scan. */
const NO_TEXT_LAYER = new TextEncoder().encode(
  [
    '%PDF-1.4',
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj',
    'trailer<</Root 1 0 R/Size 4>>',
    '%%EOF',
    '',
  ].join('\n'),
);

function bddk(): Uint8Array {
  return new Uint8Array(readFileSync(join(SOURCES, 'bddk-11364-2026-01-29.pdf')));
}

describe('extractPdfText', () => {
  it('reads the text of a real document', async () => {
    const { pages } = await extractPdfText(bddk());

    expect(pages).toHaveLength(1);
    expect(pages[0]).toContain('11364');
  });

  it('keeps Turkish characters intact', async () => {
    // The documents this tool exists to read are Turkish. Mangled diacritics
    // would corrupt every place name and every regulation title downstream.
    const { pages } = await extractPdfText(bddk());

    expect(pages[0]).toContain('Bankacılık Düzenleme ve Denetleme Kurulu Kararı');
  });

  it('reports that a document has a text layer', async () => {
    expect((await extractPdfText(bddk())).hasTextLayer).toBe(true);
  });

  it('reports a scanned document rather than returning empty text as success', async () => {
    // Returning "" quietly would look identical to a document that genuinely
    // says nothing, and the caller would record a blank finding as a fact.
    const result = await extractPdfText(NO_TEXT_LAYER);

    expect(result.hasTextLayer).toBe(false);
    expect(result.pages).toEqual(['']);
  });

  it('refuses something that is not a PDF', async () => {
    await expect(extractPdfText(new TextEncoder().encode('just some text'))).rejects.toThrow(
      NotAPdfError,
    );
  });

  it('does not warn on stderr while reading a normal document', async () => {
    const warnings: unknown[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]): void => void warnings.push(args);

    try {
      await extractPdfText(bddk());
    } finally {
      console.warn = original;
    }

    expect(warnings).toEqual([]);
  });
});
