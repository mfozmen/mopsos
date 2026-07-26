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

/** Returns true when the probe genuinely calibrates its target. */
function checkProbe(probe: Verdict, byId: Map<string, Verdict>, problems: string[]): boolean {
  const targetId = probe.calibration_probe_of;
  /* v8 ignore next -- callers filter probes first */
  if (targetId === undefined) return false;

  const target = byId.get(targetId);
  if (!target) {
    problems.push(`${probe.id} is a probe of ${targetId}, which does not exist`);
    return false;
  }

  const found: string[] = [];

  if (target.calibration_probe_of !== undefined) {
    found.push(`${probe.id} is a probe of ${targetId}, which is itself a probe`);
  }

  // A probe measures one seer. Scored against another seer's call it measures
  // nothing, while still counting towards that call's required coverage — which
  // would let a seer satisfy the rule using someone else's work.
  if (probe.seer !== target.seer) {
    found.push(
      `${probe.id} (seer ${probe.seer}) calibrates ${targetId} (seer ${target.seer}): ` +
        'a probe must be by the same seer as the verdict it calibrates',
    );
  }

  if (probe.asset_class !== target.asset_class) {
    found.push(
      `${probe.id} is ${probe.asset_class} but calibrates ${targetId}, which is ` +
        `${target.asset_class}: a probe must be in the same asset class`,
    );
  }

  const days = horizonDays(probe);
  if (days < PROBE_MIN_DAYS || days > PROBE_MAX_DAYS) {
    found.push(
      `${probe.id} resolves in ${days} days; a calibration probe must resolve ` +
        `between 2 and 8 weeks so it can inform the call it supports`,
    );
  }

  problems.push(...found);
  return found.length === 0;
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

  // Only valid probes count towards coverage. Counting the invalid ones happens
  // to be harmless today, because any problem rejects the whole set — but it
  // would quietly become a way to satisfy the rule with broken probes the moment
  // anything reports instead of throwing.
  const probeCount = new Map<string, number>();
  for (const verdict of verdicts) {
    const targetId = verdict.calibration_probe_of;
    if (targetId === undefined) continue;

    if (checkProbe(verdict, byId, problems)) {
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
