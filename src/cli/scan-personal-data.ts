/**
 * Fails when a file in this repository contains the author's own personal data.
 *
 * A separate problem from secret scanning, which matches credential formats and
 * cannot recognise a first-person amount as sensitive. On a public repository the
 * risk that matters is not a remote attacker — it is publishing your own finances
 * by accident, and a commit deleted five minutes later is already cloned and
 * indexed. See private/README.md for what that looks like.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { findPersonalData } from '../security/personal-data.js';

/**
 * `private/` is skipped because personal data belongs there by design — that is
 * the entire point of the directory. The rest are build output, dependencies,
 * and agent scratch: nothing authored, and all of it git-ignored, so none of it
 * can reach the public repository this scanner exists to protect.
 *
 * `.playwright-mcp/` earns its place the hard way. It fills with page snapshots
 * whenever an agent reads a bank site, and every one of those carries the
 * bank's call-centre number. Twenty findings, none of them real, none of them
 * committable — and a check that cries wolf is a check that gets waved through,
 * which is worse than not having it.
 *
 * Untracked files are otherwise scanned. That errs towards noise rather than
 * towards missing something, which is the correct direction for a leak detector.
 */
const SKIP_DIRECTORIES = new Set([
  'private',
  'node_modules',
  '.git',
  'coverage',
  'dist',
  '.playwright-mcp',
  '.research',
]);

/**
 * Only the scanner's own tests, which are wall-to-wall fixtures of the very
 * things it looks for.
 *
 * Everywhere else that has to quote a forbidden example uses the line-scoped
 * `scan-ignore: example` marker instead. A file-level exemption is permanent and
 * invisible; a line marker sits where it is used and `grep` finds all of them.
 */
const SKIP_FILES = new Set(
  ['src/security/personal-data.test.ts'].map((path) => path.split('/').join(sep)),
);

const SCANNABLE = /\.(ts|js|json|md|ya?ml|txt|csv|properties)$/;

function* files(directory: string): Generator<string> {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      if (!SKIP_DIRECTORIES.has(entry.name)) yield* files(path);
      continue;
    }

    if (SCANNABLE.test(entry.name)) yield path;
  }
}

const root = process.argv[2] ?? '.';
let scanned = 0;
let hits = 0;

for (const path of files(root)) {
  const relativePath = relative(root, path);
  if (SKIP_FILES.has(relativePath)) continue;

  scanned += 1;
  for (const finding of findPersonalData(readFileSync(path, 'utf8'))) {
    console.error(`${relativePath}:${finding.line}  ${finding.kind}  ${finding.match}`);
    hits += 1;
  }
}

if (hits > 0) {
  console.error(`\n${hits} possible personal data leak(s). See private/README.md.`);
  process.exit(1);
}

console.log(`No personal data found in ${scanned} files.`);
