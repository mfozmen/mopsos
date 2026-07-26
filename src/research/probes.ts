import type { Verdict } from '../schema/types.js';

const MS_PER_DAY = 86_400_000;

/**
 * A probe exists to produce a measurable result while a long call is still open.
 * Under two weeks it usually measures noise; over eight it stops being early
 * feedback and becomes another long call that needs probes of its own.
 */
const PROBE_MIN_DAYS = 14;
const PROBE_MAX_DAYS = 56;

/**
 * Above this, a verdict is long-horizon and cannot stand alone. Housing feedback
 * runs 6-24 months; without short probes the track record sits empty for most of
 * a year, and a seer's confidence has nothing behind it but its own assertion.
 */
const LONG_HORIZON_DAYS = PROBE_MAX_DAYS;

const REQUIRED_PROBES = 2;

/** Only housing is slow enough to need this. The other classes resolve on their own. */
const NEEDS_PROBES = new Set(['housing']);

export class ProbeCoverageError extends Error {
  constructor(readonly problems: string[]) {
    super(`Calibration probe rules not met:\n  ${problems.join('\n  ')}`);
    this.name = 'ProbeCoverageError';
  }
}

function horizonDays(verdict: Verdict): number {
  return (Date.parse(verdict.due_at) - Date.parse(verdict.created_at)) / MS_PER_DAY;
}

function checkProbe(probe: Verdict, byId: Map<string, Verdict>, problems: string[]): void {
  const targetId = probe.calibration_probe_of;
  if (targetId === undefined) return;

  const target = byId.get(targetId);
  if (!target) {
    problems.push(`${probe.id} is a probe of ${targetId}, which does not exist`);
    return;
  }

  if (target.calibration_probe_of !== undefined) {
    problems.push(`${probe.id} is a probe of ${targetId}, which is itself a probe`);
  }

  const days = horizonDays(probe);
  if (days < PROBE_MIN_DAYS || days > PROBE_MAX_DAYS) {
    problems.push(
      `${probe.id} resolves in ${days} days; a calibration probe must resolve ` +
        `between 2 and 8 weeks so it can inform the call it supports`,
    );
  }
}

/**
 * Checks the probe rules across a set of verdicts.
 *
 * Cross-file by nature — a probe and the verdict it calibrates live in separate
 * files — so this cannot be a schema rule and cannot be checked one verdict at
 * a time.
 */
export function assertProbeCoverage(verdicts: Verdict[]): void {
  const problems: string[] = [];
  const byId = new Map(verdicts.map((verdict) => [verdict.id, verdict]));

  const probeCount = new Map<string, number>();
  for (const verdict of verdicts) {
    checkProbe(verdict, byId, problems);

    const targetId = verdict.calibration_probe_of;
    if (targetId !== undefined) {
      probeCount.set(targetId, (probeCount.get(targetId) ?? 0) + 1);
    }
  }

  for (const verdict of verdicts) {
    if (verdict.calibration_probe_of !== undefined) continue;
    if (!NEEDS_PROBES.has(verdict.asset_class)) continue;
    if (horizonDays(verdict) <= LONG_HORIZON_DAYS) continue;

    const count = probeCount.get(verdict.id) ?? 0;
    if (count < REQUIRED_PROBES) {
      problems.push(
        `${verdict.id} resolves in ${horizonDays(verdict)} days and needs at least two ` +
          `calibration probes, but has ${count}`,
      );
    }
  }

  if (problems.length > 0) throw new ProbeCoverageError(problems);
}
