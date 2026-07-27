/** Certificate chain problems, which are common on Turkish public sector sites. */
const CERTIFICATE_CODES = new Set([
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'CERT_HAS_EXPIRED',
]);

function causeCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('cause' in error)) return undefined;
  const { cause } = error;
  if (typeof cause !== 'object' || cause === null || !('code' in cause)) return undefined;
  const { code } = cause;
  return typeof code === 'string' ? code : undefined;
}

/**
 * Turns a failed download into something a person can act on.
 *
 * Node's bare "fetch failed" is the worst kind of error message: it names no
 * cause and suggests no next step, so the reader assumes the site is down when
 * the site is fine.
 *
 * Deliberately never suggests disabling certificate verification. That would
 * fix this one download and quietly weaken every other one for as long as the
 * setting survives.
 */
export function explainFetchFailure(url: string, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  const code = causeCode(error);

  if (code !== undefined && CERTIFICATE_CODES.has(code)) {
    return (
      `${url} could not be downloaded: its TLS certificate chain is incomplete (${code}).\n\n` +
      `The site is fine — Node is stricter here than a browser or curl, which fill the ` +
      `missing chain from the system store. Download it and pass the local path:\n\n` +
      `  curl -sL -o document.pdf "${url}"\n\n` +
      `To fix it properly, point NODE_EXTRA_CA_CERTS at a bundle containing the issuer.`
    );
  }

  return `${url} could not be downloaded: ${detail}`;
}

export class PdfFetchError extends Error {
  constructor(url: string, cause: unknown) {
    super(explainFetchFailure(url, cause));
    this.name = 'PdfFetchError';
    this.cause = cause;
  }
}

/** Downloads a PDF, failing with an explanation rather than a stack trace. */
export async function fetchPdf(url: string): Promise<Uint8Array> {
  let response: Response;

  try {
    response = await fetch(url);
  } catch (error) {
    throw new PdfFetchError(url, error);
  }

  if (!response.ok) {
    throw new PdfFetchError(url, new Error(`returned ${response.status} ${response.statusText}`));
  }

  return new Uint8Array(await response.arrayBuffer());
}
