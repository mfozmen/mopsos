/**
 * Opens one page in this run's own browser and writes down what it says.
 *
 * The Playwright MCP server is a single process driving a single browser, and
 * every subagent in a session talks to that same one. Three readings in one
 * afternoon were lost to it: an agent navigated, went away to think, and came
 * back to somebody else's page. Scope does not help — one session, one server,
 * one tab, however it is installed.
 *
 * So an agent that needs more than a glance drives its own browser instead.
 * That is what this is. It is deliberately not a scraper: one page, one visit,
 * both a text dump and a screenshot, then it exits.
 *
 * Usage: npm run read:page -- <url> [outputDir] [waitSeconds]
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { type BrowserContext, chromium } from 'playwright';

import {
  allowsRequestTo,
  BadPageRequestError,
  browserOptions,
  CHANNELS,
  isPrivateHost,
  isRefusalError,
  launchAdvice,
  parsePageRequest,
} from '../browser/page-request.js';

// A real browser saying who it is. Not a disguise: the point is to read a
// public page the way a person would, and pretending to be something else is
// where reading a website turns into evading one.
const VIEWPORT = { width: 1440, height: 900 };

/**
 * Opens the first browser this machine actually has.
 *
 * Tried rather than looked up: install paths differ by platform and by how the
 * browser got there, and a wrong guess fails in a way that reads like the site
 * refusing us. A failed launch costs a moment and only happens when the browser
 * is genuinely absent.
 */
async function launchReal(profile: string): Promise<BrowserContext> {
  let last: unknown;

  for (const channel of CHANNELS) {
    try {
      return await chromium.launchPersistentContext(profile, {
        ...browserOptions(channel),
        viewport: VIEWPORT,
        locale: 'tr-TR',
        timezoneId: 'Europe/Istanbul',
      });
    } catch (error) {
      last = error;
    }
  }

  throw last;
}

async function main(): Promise<void> {
  // Never the working directory, which is the public repository. The briefs
  // forbid leaving working files there and this is the tool they use.
  const request = parsePageRequest(process.argv.slice(2), () =>
    mkdtempSync(join(tmpdir(), 'mopsos-page-')),
  );
  mkdirSync(dirname(request.text), { recursive: true });

  // A real browser, in a real window, with nothing patched.
  //
  // Measured on one connection, one site, one afternoon: the bundled headless
  // shell was refused, real Chrome in headless mode was refused, and real
  // Chrome with a window went through — with `navigator.webdriver` still true.
  // So the window is what a site is reading, not the binary and not the flag,
  // and opening one is being what we are rather than pretending otherwise.
  //
  // A fresh profile each run. Nothing carries over, which is both simpler and
  // less to leave behind on the machine.
  const browser = await launchReal(mkdtempSync(join(tmpdir(), 'mopsos-profile-')));

  try {
    const page = browser.pages()[0] ?? (await browser.newPage());

    // Checked on every request, not just the one that was typed. goto follows
    // redirects without asking, so a public domain answering 302 to the metadata
    // service would otherwise walk straight past the check made before launch.
    const refused: string[] = [];
    await page.route('**/*', async (route) => {
      const url = route.request().url();
      if (!allowsRequestTo(url)) {
        refused.push(url);
        return route.abort('blockedbyclient');
      }

      // `continue()`, not `fetch()` + `fulfill()`, and the difference is the
      // whole tool working.
      //
      // `fetch()` makes the request from Playwright rather than from the
      // browser, so the TLS and HTTP/2 fingerprint reverts to Playwright's —
      // which is exactly what a bot check reads. Measured on one site, one
      // moment, same real headful Chrome: no routing 5.172 characters,
      // `continue()` 5.172 characters, `fetch()` + `fulfill()` 277 and a
      // refusal page. The tighter guard made the tool unable to read the sites
      // it exists to read.
      //
      // What that costs, stated plainly rather than left to be discovered: the
      // browser follows a server redirect inside the request it was already
      // allowed to make, and does not come back through here. So a public
      // domain answering 302 to a private address DOES get connected to. The
      // landing check below then refuses to write down anything that came back.
      //
      // That is a real reduction and it is the right trade here. The attacker
      // in that scenario controls the redirector, not the response's origin, so
      // no script of theirs can read what arrives; the only reader is this
      // tool, and this tool declines. What remains exposed is a side-effecting
      // GET on an internal service, which is narrow and worth naming.
      return route.continue();
    });

    // A navigation refused by the handler above rejects here, which is the guard
    // working rather than a failure to report.
    await page
      .goto(request.url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      .catch((error: unknown) => {
        // Only the guard's own refusal. Any other failure is a page that did
        // not load, and reporting it as read because a subresource happened to
        // be refused in the same run is how a half-read page becomes evidence.
        if (!isRefusalError(error)) throw error;
      });

    // Said before anything else, because a refusal is the most important thing
    // that can have happened.
    if (refused.length > 0) {
      console.error(`Refused ${String(refused.length)} request(s) to non-public addresses:`);
      for (const url of refused.slice(0, 5)) console.error(`  ${url}`);
    }

    // Belt to the handler's braces. The handler stops the connection; this
    // catches anything that reached a private address by a route it does not
    // see, and refuses to write down what came back.
    const landed = new URL(page.url());
    if (isPrivateHost(landed.hostname)) {
      console.error(
        `Redirected to ${landed.host}, which is not on the public internet. Nothing was read.`,
      );
      process.exitCode = 4;
      return;
    }

    // Rate tables are drawn by script. Settling is what makes the difference
    // between an empty page and the numbers.
    await page.waitForTimeout(request.waitSeconds * 1000);

    // Playwright's own reader rather than an evaluate into the page: this file
    // is compiled against Node's libraries, and `document` does not exist here.
    const text = await page.locator('body').innerText();
    writeFileSync(request.text, text, 'utf8');
    await page.screenshot({ path: request.screenshot, fullPage: true });

    console.log(`${request.url}\n  ${request.text}  (${String(text.length)} characters)`);
    console.log(`  ${request.screenshot}`);

    // Said out loud, because a page that loaded empty and a page that was
    // refused look identical in a text file nobody opens.
    if (text.trim().length < 200) {
      console.error('\nThe page came back nearly empty — blocked, or still loading.');
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
}

try {
  await main();
} catch (error: unknown) {
  if (error instanceof BadPageRequestError) {
    console.error(error.message);
    process.exit(2);
  }

  const advice = launchAdvice(error);
  if (advice !== undefined) {
    console.error(advice);
    process.exit(3);
  }

  throw error;
}
