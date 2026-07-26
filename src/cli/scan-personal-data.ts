/**
 * Fails when a tracked file contains the author's own personal data.
 *
 * A separate problem from secret scanning, which matches credential formats and
 * cannot recognise a first-person amount as sensitive. On a public repository the
 * risk that matters is not a remote attacker — it is publishing your own finances
 * by accident, and a commit deleted five minutes later is already cloned and
 * indexed. See private/README.md for what that looks like.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { findPersonalData } from '../security/personal-data.js';

/**
 * Files whose job is to *describe* the rule, and which therefore quote examples
 * of what breaks it: the scanner's own tests, and the four documents that teach
 * the policy.
 *
 * Excluding them is the honest option. The alternatives are worse: weakening the
 * patterns until they stop matching their own test data, or rewording the
 * examples until they slip past the regex — which is gaming the check while
 * pretending to pass it.
 *
 * The list stays short and is reviewed on sight. Every other tracked file is
 * scanned, including everything under research/, which is where real data would
 * actually land.
 */
const EXCLUDED = new Set([
  'src/security/personal-data.test.ts',
  'private/README.md',
  'README.md',
  'SECURITY.md',
  'CLAUDE.md',
]);

const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split('\n')
  .filter((path) => path.length > 0 && !EXCLUDED.has(path));

let hits = 0;

for (const path of tracked) {
  let content: string;
  try {
    content = readFileSync(path, 'utf8');
  } catch {
    continue; // unreadable or binary; nothing to scan
  }

  for (const finding of findPersonalData(content)) {
    console.error(`${path}:${finding.line}  ${finding.kind}  ${finding.match}`);
    hits += 1;
  }
}

if (hits > 0) {
  console.error(`\n${hits} possible personal data leak(s). See private/README.md.`);
  process.exit(1);
}

console.log(`No personal data found in ${tracked.length} tracked files.`);
