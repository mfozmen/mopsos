import type { Resolution, Verdict } from './types.js';

/**
 * One comparison of the measured value against a fixed number. Nothing else.
 *
 * The point is not tidiness. A rule a human has to interpret is a rule that gets
 * interpreted generously once the result is in, and the track record quietly
 * stops meaning anything. If this regex cannot evaluate it, neither can anyone
 * else fairly, six months from now.
 */
const RULE = /^value\s*(?:>=|<=|>|<)\s*-?\d+(?:\.\d+)?$/;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^(\d{4})-(\d{2})$/;
const WEEK = /^(\d{4})-W(\d{2})$/;

const MS_PER_DAY = 86_400_000;

export class UnmeasurableVerdictError extends Error {
  constructor(readonly problems: string[]) {
    super(`Verdict is not measurable:\n  ${problems.join('\n  ')}`);
    this.name = 'UnmeasurableVerdictError';
  }
}

/** The last calendar day covered by a reference period, as an ISO date. */
export function referencePeriodEnd(period: string): string {
  if (DAY.test(period)) return period;

  const month = MONTH.exec(period);
  if (month) {
    // Day 0 of the following month is the last day of this one.
    return new Date(Date.UTC(Number(month[1]), Number(month[2]), 0)).toISOString().slice(0, 10);
  }

  const week = WEEK.exec(period);
  if (week) {
    // ISO-8601: week 1 contains 4 January, weeks start Monday and end Sunday.
    const fourthOfJanuary = new Date(Date.UTC(Number(week[1]), 0, 4));
    const isoWeekday = fourthOfJanuary.getUTCDay() || 7;
    const firstMonday = Date.UTC(Number(week[1]), 0, 4 - isoWeekday + 1);
    return new Date(firstMonday + (Number(week[2]) * 7 - 1) * MS_PER_DAY)
      .toISOString()
      .slice(0, 10);
  }

  throw new Error(`Unrecognised reference period: ${period}`);
}

function checkResolution(resolution: Resolution, dueAt: string, problems: string[]): void {
  if (!RULE.test(resolution.rule)) {
    problems.push(
      `rule must be one comparison, like "value > 41.5" ` +
        `(got ${JSON.stringify(resolution.rule)})`,
    );
  }

  // The schema pins this too. Repeated here because this function is the gate
  // callers actually pass through, and a rule enforced in only one of two places
  // is a rule waiting to be routed around.
  if (resolution.print !== 'first') {
    problems.push('print must be "first": a revised print would rewrite a settled result');
  }

  let periodEnd: string;
  try {
    periodEnd = referencePeriodEnd(resolution.reference_period);
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
    return;
  }

  // The floor that holds whatever the publication calendar says: a value cannot
  // be read before the period it measures has finished. The real lag — TCMB
  // publishes the house price index around 15 days later — tightens this once
  // the calendar is pinned into the repository.
  if (resolution.check_after < periodEnd) {
    problems.push(
      `check_after (${resolution.check_after}) is before the end of reference_period ` +
        `(${periodEnd}): the value cannot exist yet`,
    );
  }

  if (resolution.check_after < dueAt) {
    problems.push(
      `check_after (${resolution.check_after}) is before due_at (${dueAt}): ` +
        'the verdict would come due before its answer is published',
    );
  }
}

/**
 * The semantic half of verdict validation, on top of the schema.
 *
 * Throws, and collects every problem before it does. A caller handed a boolean
 * will eventually ignore it, and the one thing this project cannot survive is
 * storing a prediction that nobody can settle.
 */
export function assertMeasurable(verdict: Verdict): void {
  const problems: string[] = [];

  if (verdict.due_at <= verdict.created_at) {
    problems.push(
      `due_at (${verdict.due_at}) must be after created_at (${verdict.created_at}): ` +
        'a verdict about the past is not a prediction',
    );
  }

  if (verdict.calibration_probe_of === verdict.id) {
    problems.push('a verdict cannot be its own calibration probe');
  }

  checkResolution(verdict.resolution, verdict.due_at, problems);

  if (problems.length > 0) throw new UnmeasurableVerdictError(problems);
}
