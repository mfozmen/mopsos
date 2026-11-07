/**
 * Turns a finished research run into a pull request.
 *
 * Git history is what timestamps a prediction, so a run that sits in the
 * working tree has no honest date yet. This validates the run, refuses one
 * already on main, and opens the pull request — or opens nothing.
 *
 * Usage: npm run publish:run <YYYY-MM-DD-slug>
 */
import { execFileSync } from 'node:child_process';

import { loadModules } from '../modules/registry.js';
import { assertRunName, prepareRun, pullRequestBody } from '../research/publish.js';

const ROOT = 'research';

function run(command: string, args: string[], input?: string): string {
  return execFileSync(command, args, { encoding: 'utf8', input }).trim();
}

const name = process.argv[2];
if (!name) {
  console.error('Usage: npm run publish:run <YYYY-MM-DD-slug>');
  process.exit(2);
}
assertRunName(name);

run('git', ['fetch', '--quiet', 'origin', 'main']);
const runsOnMain = run('git', ['ls-tree', '--name-only', 'origin/main', `${ROOT}/`])
  .split('\n')
  .map((path) => path.slice(`${ROOT}/`.length));

const registered = loadModules('modules').map((module) => module.id);
const verdicts = prepareRun(ROOT, name, registered, runsOnMain);

const branch = `chore/research-${name}`;
const path = `${ROOT}/${name}`;
run('git', ['checkout', '-b', branch, 'origin/main']);
run('git', ['add', '--', path]);
run('git', ['commit', '--quiet', '-m', `chore(research): add run ${name}`, '--', path]);
run('git', ['push', '--quiet', '-u', 'origin', branch]);
console.log(
  run(
    'gh',
    ['pr', 'create', '--title', `chore(research): add run ${name}`, '--body-file', '-'],
    pullRequestBody(name, verdicts),
  ),
);
