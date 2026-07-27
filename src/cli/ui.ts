/**
 * Generates the local page from the record and writes it to ui/index.html.
 *
 * Read-only towards the record: it never writes into the data directory. The
 * page it produces has no network access either, so it opens straight from a
 * file.
 *
 * Usage: npm run ui
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { resolveDataDir } from '../config/data-dir.js';
import { loadModules } from '../modules/registry.js';
import { renderPage, type PageData } from '../ui/render.js';

let dataDir: string | undefined;
try {
  dataDir = resolveDataDir(process.cwd(), process.env);
} catch (error) {
  // Not fatal. A page whose tabs say what they will hold is more use than a
  // stack trace, and this is exactly the state before any research is done.
  console.warn(`${error instanceof Error ? error.message : String(error)}\n`);
}

// Tabs come from the registry, so adding an instrument stays a matter of adding
// a folder. Nothing reads research, instrument returns or records yet — those
// arrive with the market agent and the resolution runner. Empty here means empty
// on the page, which is the honest state today.
const data: PageData = {
  modules: loadModules('modules').map((module) => ({
    id: module.id,
    label_tr: module.label_tr,
    kind: module.kind,
  })),
  research: [],
  instruments: [],
  records: [],
};

mkdirSync('ui', { recursive: true });
const output = join('ui', 'index.html');
writeFileSync(output, renderPage(data), 'utf8');

console.log(`Wrote ${output} — open it:\n  ${resolve(output)}`);
if (dataDir !== undefined) console.log(`Record: ${dataDir}`);
