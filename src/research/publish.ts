import { loadVerdicts, type LoadedVerdict } from './load.js';
import { assertProbeCoverage } from './probes.js';

/**
 * Everything that must hold before a run becomes a pull request.
 *
 * The whole research tree is loaded, not just this run: a broken verdict
 * anywhere means the record cannot be read, and that should stop a new run
 * from landing on top of it. Throws on the first failing rule.
 */
export function prepareRun(
  root: string,
  run: string,
  registeredAssetClasses: string[],
  runsOnMain: string[],
): LoadedVerdict[] {
  // A merged run directory never changes again; a second PR for it would be
  // an edit of the record with a fresh timestamp on it.
  if (runsOnMain.includes(run)) {
    throw new Error(`${run} is already on main: a run is never overwritten, start a new one`);
  }

  const verdicts = loadVerdicts(root, registeredAssetClasses).filter((entry) => entry.run === run);
  if (verdicts.length === 0) throw new Error(`${run} has no verdicts under ${root}`);

  assertProbeCoverage(verdicts.map((entry) => entry.verdict));
  return verdicts;
}

function cell(text: string): string {
  return text.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

/** The pull request body: what was predicted, how sure, and when it comes due. */
export function pullRequestBody(run: string, verdicts: LoadedVerdict[]): string {
  const rows = verdicts.map(({ verdict }) =>
    [
      `\`${verdict.id}\``,
      cell(verdict.question),
      `${Math.round(verdict.probability * 100)}%`,
      verdict.due_at,
      verdict.resolution.check_after,
      verdict.calibration_probe_of ? `\`${verdict.calibration_probe_of}\`` : '',
    ].join(' | '),
  );

  return [
    `Research run \`${run}\`: ${verdicts.length} verdict(s).`,
    '',
    '| Verdict | Question | Probability | Due | Check after | Probe of |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows.map((row) => `| ${row} |`),
    '',
    'Validated and probe coverage checked before this pull request was opened. ' +
      'Once merged, these files are never edited; corrections are new records.',
  ].join('\n');
}
