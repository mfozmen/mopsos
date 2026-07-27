/**
 * Generates the local page from the repository and writes it to ui/index.html.
 *
 * Read-only towards the record: it never writes into research/. The page it
 * produces has no network access either, so it opens straight from a file.
 *
 * Usage: npm run ui [researchRoot]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { loadModules } from '../modules/registry.js';
import { loadVerdicts, loadResolvedVerdictIds } from '../research/load.js';
import { renderPage, type OpenVerdict, type SeerRecord } from '../ui/render.js';

const MS_PER_DAY = 86_400_000;

const researchRoot = process.argv[2] ?? 'research';
const modules = loadModules('modules');
const resolved = loadResolvedVerdictIds(researchRoot);

const verdicts: OpenVerdict[] = loadVerdicts(
  researchRoot,
  modules.map((module) => module.id),
)
  .filter((entry) => !resolved.has(entry.verdict.id))
  .map(({ verdict }) => ({
    id: verdict.id,
    seer: verdict.seer,
    asset_class: verdict.asset_class,
    question: verdict.question,
    probability: verdict.probability,
    horizon_days: Math.round(
      (Date.parse(verdict.due_at) - Date.parse(verdict.created_at)) / MS_PER_DAY,
    ),
    check_after: verdict.resolution.check_after,
    is_probe: verdict.calibration_probe_of !== undefined,
  }));

// Empty until outcomes exist. Shown as "nothing measured yet" rather than as a
// perfect score, because zero is the best possible Brier and an unmeasured seer
// must never look like a flawless one.
const records: SeerRecord[] = [];

const html = renderPage({
  modules: modules.map((module) => ({
    id: module.id,
    name: module.name,
    status: module.status,
  })),
  verdicts,
  records,
});

mkdirSync('ui', { recursive: true });
const output = join('ui', 'index.html');
writeFileSync(output, html, 'utf8');

console.log(`Wrote ${output} — open it with:\n  ${resolve(output)}`);
console.log(`${verdicts.length} open verdict(s), ${modules.length} asset class(es).`);
