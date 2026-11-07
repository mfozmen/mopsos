/**
 * Runs every check publish:run would, without opening anything: the whole
 * research tree validates and the run's probes cover its long verdicts.
 * A seer runs this on its own output before reporting back.
 *
 * Usage: npm run check:run -- <YYYY-MM-DD-slug>
 */
import { loadModules } from '../modules/registry.js';
import { prepareRun } from '../research/publish.js';

const name = process.argv[2];
if (!name) {
  console.error('Usage: npm run check:run -- <YYYY-MM-DD-slug>');
  process.exit(2);
}

try {
  const registered = loadModules('modules').map((module) => module.id);
  // No list of runs on main: this is a local check of files not yet published.
  const verdicts = prepareRun('research', name, registered, []);
  console.log(`${name}: ${verdicts.length} verdict(s), all checks pass`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
