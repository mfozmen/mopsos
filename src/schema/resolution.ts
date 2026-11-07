import { checkAfter } from '../calendar/calendar.js';
import { referencePeriodEnd } from './period.js';
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

export class UnmeasurableVerdictError extends Error {
  constructor(readonly problems: string[]) {
    super(`Verdict is not measurable:\n  ${problems.join('\n  ')}`);
    this.name = 'UnmeasurableVerdictError';
  }
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

  // TCMB series are released on a pinned calendar, so the earliest honest date
  // is known up front. A hand-written date earlier than that would resolve
  // against a value that does not exist yet.
  if (resolution.source === 'evds') {
    try {
      const earliest = checkAfter(resolution.series, resolution.reference_period);
      if (resolution.check_after < earliest) {
        problems.push(
          `check_after (${resolution.check_after}) is before ${resolution.series} for ` +
            `${resolution.reference_period} is published (${earliest}, from data/calendars/)`,
        );
      }
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  }

  // The floor for every source: a value cannot be read before the period it
  // measures has finished.
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
