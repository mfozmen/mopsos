import { join } from 'node:path';

export class BadPageRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BadPageRequestError';
  }
}

export interface PageRequest {
  url: string;
  /** Where the page's visible text is written. */
  text: string;
  /** Where the full-page screenshot is written. */
  screenshot: string;
  waitSeconds: number;
}

const MAX_WAIT_SECONDS = 60;
const DEFAULT_WAIT_SECONDS = 5;

/**
 * Turns the command line into something safe to open in a browser.
 *
 * The url comes from an agent's own reasoning about which page of a bank's site
 * to read, and this opens it in a real browser on the user's machine. `file:`
 * would read the disk and `javascript:` would run whatever followed it, so the
 * scheme is an allowlist rather than a check for the obviously bad.
 *
 * The wait is bounded for the same reason a scraper reports how many listings it
 * saw: an unbounded one turns a page that will never load into a run that never
 * ends, and a run that never ends looks exactly like a run that is working.
 */
export function parsePageRequest(argv: string[], defaultOut: string): PageRequest {
  const [url, out, wait] = argv;

  if (url === undefined || url.trim().length === 0) {
    throw new BadPageRequestError('Usage: npm run read:page -- <url> [outputDir] [waitSeconds]');
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new BadPageRequestError(
      `Not a url, so not something to open: ${url}. Use http or https.`,
    );
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new BadPageRequestError(`Only http and https can be opened, not ${parsed.protocol}`);
  }

  const directory = out ?? defaultOut;
  const requested = wait === undefined ? DEFAULT_WAIT_SECONDS : Number(wait);
  const seconds = Number.isFinite(requested) && requested > 0 ? requested : DEFAULT_WAIT_SECONDS;

  return {
    url,
    text: join(directory, 'page.txt'),
    screenshot: join(directory, 'page.png'),
    waitSeconds: Math.min(seconds, MAX_WAIT_SECONDS),
  };
}

/**
 * What to do about a browser that would not start, when there is an answer.
 *
 * The `playwright` package and the browser binaries are versioned separately,
 * so a machine that already has the MCP server's chromium can still be missing
 * this one's — which is exactly what happened the first time this ran. That
 * failure arrives as a stack trace naming a path, and nothing in it says that
 * one command fixes it.
 *
 * Nothing is offered for any other failure. A guess about a network error would
 * send whoever reads it in the wrong direction, and this exists to save time.
 */
export function launchAdvice(error: unknown): string | undefined {
  const message = error instanceof Error ? error.message : String(error);
  if (!message.includes("Executable doesn't exist")) return undefined;

  return 'No browser installed. Run this once: npx playwright install chromium';
}
