import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { OutsideAllowedRootError, PdfReadError, readPdf } from './read.js';
import { PdfFetchError } from './fetch.js';

function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), 'mopsos-pdf-'));
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(join(root, 'docs', 'a.pdf'), 'pretend pdf', 'utf8');
  return root;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('local files', () => {
  it('reads a file inside an allowed root', async () => {
    const root = workspace();

    expect(await readPdf(join(root, 'docs', 'a.pdf'), [root])).toEqual(
      new TextEncoder().encode('pretend pdf'),
    );
  });

  it('reads a path given relative to an allowed root', async () => {
    const root = workspace();

    expect(await readPdf('docs/a.pdf', [root])).toHaveLength(11);
  });

  it('refuses a path that climbs out of every allowed root', async () => {
    // The caller here is a subagent constructing paths from a request. Reading
    // anything on the machine is not a capability this tool needs.
    const root = workspace();

    await expect(readPdf('../../../etc/passwd', [root])).rejects.toThrow(OutsideAllowedRootError);
  });

  it('refuses an absolute path outside every allowed root', async () => {
    const root = workspace();
    const elsewhere = workspace();

    await expect(readPdf(join(elsewhere, 'docs', 'a.pdf'), [root])).rejects.toThrow(
      OutsideAllowedRootError,
    );
  });

  it('accepts a file under any one of several allowed roots', async () => {
    const code = workspace();
    const data = workspace();

    expect(await readPdf(join(data, 'docs', 'a.pdf'), [code, data])).toHaveLength(11);
  });

  it('reports a missing file as unreadable, not as an empty document', async () => {
    // Anything that is not clearly "no text layer" must not exit as if it were:
    // the caller would go and take screenshots of a file that is not there.
    const root = workspace();

    await expect(readPdf('docs/missing.pdf', [root])).rejects.toBeInstanceOf(PdfReadError);
  });

  it('says it could not read the file rather than leaking an errno', async () => {
    const root = workspace();

    await expect(readPdf('docs/missing.pdf', [root])).rejects.toThrow(
      /could not be read.*missing\.pdf/s,
    );
  });

  it('names the roots it would have accepted', async () => {
    const root = workspace();

    await expect(readPdf('/nowhere/a.pdf', [root])).rejects.toThrow(root);
  });
});

describe('urls', () => {
  it('downloads http and https targets', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response(new TextEncoder().encode('downloaded'), { status: 200 })),
    );

    expect(await readPdf('https://example.test/a.pdf', [workspace()])).toHaveLength(10);
  });

  it('reports the status when the server answers with an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('', { status: 404, statusText: 'Not Found' })),
    );

    await expect(readPdf('https://example.test/a.pdf', [workspace()])).rejects.toThrow(/404/);
  });

  it('wraps a network failure rather than letting undici internals surface', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

    await expect(readPdf('https://example.test/a.pdf', [workspace()])).rejects.toThrow(
      PdfFetchError,
    );
  });
});
