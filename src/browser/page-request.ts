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

/**
 * Addresses only this machine, or its network, can reach.
 *
 * A bank is on the public internet. Anything here is not the job, and two of
 * these ranges are actively dangerous: 169.254.169.254 is the AWS and Azure
 * metadata service and 100.100.100.200 is Alibaba's, both of which hand out
 * credentials over plain unauthenticated http to whatever asks.
 *
 * RFC 6598 (100.64.0.0/10) earns its place for that second one. It is carrier
 * NAT space rather than private space, so it is easy to leave out — and it is
 * where one cloud put the same prize.
 */
const PRIVATE_IPV4 = new RegExp(
  `^(?:${[
    String.raw`127(\.\d+){3}`, // loopback
    String.raw`0\.0\.0\.0`, // "this host", which resolves to loopback
    String.raw`10(\.\d+){3}`, // RFC 1918
    String.raw`192\.168(\.\d+){2}`, // RFC 1918
    String.raw`172\.(1[6-9]|2\d|3[01])(\.\d+){2}`, // RFC 1918, 172.16–172.31 only
    String.raw`169\.254(\.\d+){2}`, // link-local — the AWS and Azure metadata service
    String.raw`100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])(\.\d+){2}`, // RFC 6598 — Alibaba's
  ].join('|')})$`,
);

/** `::1`, `::`, unique-local `fc00::/7` and link-local `fe80::/10`. */
const PRIVATE_IPV6 = /^(::1?|f[cde][0-9a-f]{2}:.*)$/i;

/**
 * An IPv4 address embedded in an IPv6 one, as `new URL` leaves it.
 *
 * There is more than one way to write it and they all normalise to hex, which
 * is what makes them easy to miss: `::ffff:169.254.169.254` (IPv4-mapped),
 * `::169.254.169.254` (IPv4-compatible, deprecated but still parsed),
 * `::ffff:0:169.254.169.254` (IPv4-translated) and `64:ff9b::169.254.169.254`
 * (NAT64) all arrive here as two hextets behind a known prefix.
 *
 * Only those prefixes, rather than the last two hextets of any address: a real
 * global address ending in a9fe:a9fe is a legitimate host, and refusing it
 * would be a guess dressed as a rule.
 */
const EMBEDDED_IPV4 = /^(?:::|::ffff:|::ffff:0:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i;

/**
 * Whether a hostname is one only this machine or its network can reach.
 *
 * `new URL` normalises more than it looks: `2130706433` and `0x7f000001` both
 * arrive as `127.0.0.1`, so those need no special case. What it does NOT do is
 * put an IPv4 address embedded in an IPv6 one back into dotted form —
 * `::ffff:169.254.169.254` comes back as `[::ffff:a9fe:a9fe]`, and a check
 * reading the dotted form never sees it. Same metadata service, same
 * credentials, one notation away, and there are four notations.
 *
 * Matched on the literal host rather than resolved, which is the honest limit of
 * this guard: a public name pointing at a private address still gets through. It
 * closes the case that arises here — an agent reasoning its way to the wrong url
 * — and does not pretend to be a network policy.
 */
export function isPrivateHost(hostname: string): boolean {
  if (hostname.toLowerCase() === 'localhost') return true;
  if (PRIVATE_IPV4.test(hostname)) return true;

  const bare = hostname.replace(/^\[|\]$/g, '');
  if (PRIVATE_IPV6.test(bare)) return true;

  const mapped = EMBEDDED_IPV4.exec(bare);
  if (mapped === null) return false;

  const high = Number.parseInt(mapped[1] ?? '', 16);
  const low = Number.parseInt(mapped[2] ?? '', 16);
  const dotted = [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.');

  return PRIVATE_IPV4.test(dotted);
}

const MAX_WAIT_SECONDS = 60;
const DEFAULT_WAIT_SECONDS = 5;

/**
 * Whether a request the browser is about to make should be allowed out.
 *
 * The url check happens once, before anything loads. A redirect happens after,
 * and `goto` follows them without asking: a public domain that answers 302 to
 * 169.254.169.254 walks straight past a guard that only read what was typed.
 * That is the realistic way past this, because it needs nothing but a domain
 * the attacker already controls.
 *
 * So every request the page makes is checked, not just the first — redirects
 * and subresources alike.
 *
 * What this still does not stop is a public name that simply resolves to a
 * private address. Nothing at the url layer can: the name looks ordinary and
 * only DNS knows otherwise. Said plainly rather than left implied.
 */
export function allowsRequestTo(url: string): boolean {
  try {
    return !isPrivateHost(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * Turns the command line into something safe to open in a browser.
 *
 * The url comes from an agent's own reasoning about which page of a bank's site
 * to read, and this opens it in a real browser on the user's machine. `file:`
 * would read the disk and `javascript:` would run whatever followed it, so the
 * scheme is an allowlist rather than a check for the obviously bad.
 *
 * `defaultOut` is a function so the fallback directory is only created when it
 * is actually the one being used.
 *
 * The wait is bounded for the same reason a scraper reports how many listings it
 * saw: an unbounded one turns a page that will never load into a run that never
 * ends, and a run that never ends looks exactly like a run that is working.
 */
export function parsePageRequest(argv: string[], defaultOut: () => string): PageRequest {
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

  if (isPrivateHost(parsed.hostname)) {
    throw new BadPageRequestError(
      `Only addresses on the public internet can be opened, and ${parsed.hostname} is not one`,
    );
  }

  // Called only when no directory was given: building one every time leaves an
  // empty folder behind on every run that passed its own.
  const directory = out ?? defaultOut();
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

/**
 * Whether a navigation failed because the guard turned it away.
 *
 * Worth telling apart from any other failure. A run can refuse a subresource —
 * an ad script pointing somewhere it should not — while the page itself fails
 * for an ordinary reason, and treating "something was refused" as licence to
 * swallow every error would report that page as read when it was not.
 */
export function isRefusalError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('ERR_BLOCKED_BY_CLIENT');
}

/** Channels worth trying, best first, then the bundled browser. */
export const CHANNELS = ['chrome', 'msedge', 'chrome-beta', 'msedge-beta', undefined] as const;

export interface BrowserChoice {
  channel?: string;
  headless: false;
}

/**
 * How to launch, given a channel to try.
 *
 * A person on this machine uses a real browser, so this uses one too — and that
 * is not a disguise. It IS the browser, launched the way a person launches it,
 * with nothing patched and `navigator.webdriver` left exactly as the browser
 * sets it. The line this project draws is between being what you are and
 * pretending to be something else, and a real window is the former.
 *
 * Always headful, and that is the whole finding. On one connection, one site,
 * one moment: the bundled headless shell was refused, real Chrome in headless
 * mode was refused, and real Chrome with a window went through with
 * `navigator.webdriver` still true. The window is what a site reads — not the
 * binary, and not the flag.
 */
export function browserOptions(channel?: string): BrowserChoice {
  return channel === undefined ? { headless: false } : { channel, headless: false };
}
