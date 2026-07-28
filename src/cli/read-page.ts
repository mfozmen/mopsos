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
  launchAdvice,
  parsePageRequest,
} from '../browser/page-request.js';

// A real browser saying who it is. Not a disguise: the point is to read a public
// page the way a person would, and pretending to be something else is where
// reading a website turns into evading one.
const VIEWPORT = { width: 1440, height: 2000 };

async function main(): Promise<void> {
  // Never the working directory, which is the public repository. The briefs
  // forbid leaving working files there and this is the tool they use.
  const request = parsePageRequest(
    process.argv.slice(2),
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
      if (allowsRequestTo(url)) return route.continue();

      refused.push(url);
      return route.abort('blockedbyclient');
    });

    await page.goto(request.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    // Checked again, because the route handler above does not see this one.
    // Playwright follows a server redirect inside the request it already let
    // through, so a public domain answering 302 to 127.0.0.1 arrives with
    // nothing refused and a page happily read — which is exactly what happened
    // when this was tried against a real redirector.
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
