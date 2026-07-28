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

import { chromium } from 'playwright';

import {
  allowsRequestTo,
  BadPageRequestError,
  isPrivateHost,
  isRefusalError,
  launchAdvice,
  parsePageRequest,
} from '../browser/page-request.js';

// A real browser saying who it is. Not a disguise: the point is to read a public
// page the way a person would, and pretending to be something else is where
// reading a website turns into evading one.
const VIEWPORT = { width: 1440, height: 2000 };

/** Enough for a real site's redirects, few enough that a loop cannot run away. */
const MAX_REDIRECTS = 10;

async function main(): Promise<void> {
  // Never the working directory, which is the public repository. The briefs
  // forbid leaving working files there and this is the tool they use.
  const request = parsePageRequest(process.argv.slice(2), () =>
    mkdtempSync(join(tmpdir(), 'mopsos-page-')),
  );
  mkdirSync(dirname(request.text), { recursive: true });

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: VIEWPORT, locale: 'tr-TR' });

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

      // The redirect chain is walked here rather than by the browser, and this
      // is the only arrangement that actually works.
      //
      // Left alone, the browser follows a redirect inside the request it was
      // already allowed to make and never comes back through this handler — so
      // the connection to the private address happens, and all that can be done
      // afterwards is to refuse to write down what came back. That is
      // suppressing the disclosure, not preventing the request, and it is not
      // enough where the GET itself is the event. Handing back the 3xx instead
      // of following it was tried and changes nothing: the browser still
      // follows it unrouted.
      //
      // So each hop is fetched from here, checked before the next one is made,
      // and only the final response is handed to the page.
      let response = await route.fetch({ maxRedirects: 0 });

      for (let hop = 0; hop < MAX_REDIRECTS; hop += 1) {
        const location = response.headers()['location'];
        if (response.status() < 300 || response.status() >= 400 || location === undefined) break;

        const next = new URL(location, response.url()).toString();
        if (!allowsRequestTo(next)) {
          refused.push(next);
          return route.abort('blockedbyclient');
        }

        response = await route.fetch({ url: next, maxRedirects: 0 });
      }

      return route.fulfill({ response });
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

main().catch((error: unknown) => {
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
});
