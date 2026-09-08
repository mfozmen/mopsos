/**
 * Everything the page is made of, gathered from the record.
 *
 * Shared by `npm run ui`, which writes the file, and `npm run dev`, which
 * serves it. They used to be a writer and a reader of `ui/index.html`, so
 * starting the server on a fresh clone gave a 404 telling you to go and run the
 * other command first — a step the machine could take on its own and therefore
 * a step nobody should have to.
 *
 * The browser bundle is compiled once and reused; the rest is read fresh, so a
 * new report appears on a refresh rather than on a restart.
 */
import { build } from 'esbuild';

import { resolveDataDir } from '../config/data-dir.js';
import { loadModules } from '../modules/registry.js';
import { loadMortgageRules } from '../finance/rules.js';
import { loadMarketReports } from '../market/load.js';
import { loadRateReports } from '../rates/load.js';
import { loadSavingsFinanceReports } from '../savings/load.js';
import { type PageData } from './render.js';

/**
 * The calculator runs in the browser, so the arithmetic has to get there — and
 * it gets there by compiling the same module the tests run against. A second,
 * hand-written copy of a payment formula would disagree with this one
 * eventually, and the disagreement would be silent.
 */
export async function compileCalculator(): Promise<string> {
  const compiled = await build({
    entryPoints: ['src/finance/browser.ts'],
    bundle: true,
    format: 'iife',
    globalName: 'Mortgage',
    platform: 'browser',
    target: 'es2022',
    write: false,
    minify: true,
  });

  return compiled.outputFiles[0]?.text ?? '';
}

/** Where the record is, or nothing — which is the honest state before any research. */
export function findDataDir(): string | undefined {
  try {
    return resolveDataDir(process.cwd(), process.env);
  } catch (error) {
    // Not fatal. A page whose tabs say what they will hold is more use than a
    // stack trace.
    console.warn(`${error instanceof Error ? error.message : String(error)}\n`);
    return undefined;
  }
}

export function readPageData(dataDir: string | undefined, bundle: string): PageData {
  return {
    // Tabs come from the registry, so adding an investment stays a matter of
    // adding a folder. Instrument returns and records are still empty — those
    // arrive with the resolution runner. Empty here means empty on the page,
    // which is the honest state today.
    modules: loadModules('modules').map((module) => ({ id: module.id, label_tr: module.label_tr })),
    research: dataDir === undefined ? [] : loadMarketReports(dataDir),
    instruments: [],
    records: [],
    rates: dataDir === undefined ? [] : loadRateReports(dataDir),
    savings: dataDir === undefined ? [] : loadSavingsFinanceReports(dataDir),
    finance: {
      bundle,
      // Validated rather than cast: the page applies these to real money, and a
      // half-edited bracket table returns a plausible wrong ratio in silence.
      rules: loadMortgageRules(),
    },
  };
}
