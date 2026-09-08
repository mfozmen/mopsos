/**
 * Generates the local page from the record and writes it to ui/index.html.
 *
 * Read-only towards the record: it never writes into the data directory.
 *
 * The page it produces holds the map, the calculator and an index of what
 * readings exist — but not the readings, which it asks the local server for.
 * So the written file is useful on its own and complete only alongside
 * `npm run dev`, which serves this same page and answers those requests.
 *
 * Usage: npm run ui
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { compileCalculator, findDataDir, readPageData } from '../ui/build.js';
import { renderPage } from '../ui/render.js';

const dataDir = findDataDir();
const page = renderPage(readPageData(dataDir, await compileCalculator()));

mkdirSync('ui', { recursive: true });
const output = join('ui', 'index.html');
writeFileSync(output, page, 'utf8');

console.log(`Wrote ${output} — open it:\n  ${resolve(output)}`);
if (dataDir !== undefined) console.log(`Record: ${dataDir}`);
