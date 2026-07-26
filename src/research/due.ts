import type { Verdict } from '../schema/types.js';

const MS_PER_DAY = 86_400_000;

export interface ResolvableVerdict {
  verdict: Verdict;
  path: string;
}

export interface DueVerdict extends ResolvableVerdict {
  /** 0 on the first day the value can exist. */
  days_overdue: number;
}

/**
 * Verdicts whose value can now be read and which have no outcome yet.
 *
 * `today` is a parameter rather than a call to the clock. This has to be
 * testable at fixed dates, and a function that reads the clock cannot be — but
 * the deeper reason is that everything touching the record stays a pure
 * function of its inputs.
 *
 * Sorted most overdue first: an unresolved verdict is the one failure mode that
 * costs nothing to ignore today and quietly hollows out the track record over
 * months, so the oldest one is the one that needs to be visible.
 */
export function dueVerdicts(
  verdicts: ResolvableVerdict[],
  resolved: ReadonlySet<string>,
  today: string,
): DueVerdict[] {
  const now = Date.parse(today);

  return verdicts
    .filter(
      (entry) =>
        !resolved.has(entry.verdict.id) && Date.parse(entry.verdict.resolution.check_after) <= now,
    )
    .map((entry) => ({
      ...entry,
      days_overdue: (now - Date.parse(entry.verdict.resolution.check_after)) / MS_PER_DAY,
    }))
    .sort((a, b) => b.days_overdue - a.days_overdue);
}

/** The report a human reads. Separate from printing it, so it can be tested. */
export function formatDueReport(due: DueVerdict[], today: string): string {
  if (due.length === 0) return `Nothing to resolve as of ${today}.`;

  const lines = [`${due.length} verdict(s) ready to resolve as of ${today}:`, ''];

  for (const { verdict, days_overdue, path } of due) {
    lines.push(
      `  ${verdict.id}  (${days_overdue}d overdue)`,
      `    ${verdict.question}`,
      `    ${verdict.resolution.source} ${verdict.resolution.series} — ${verdict.resolution.rule}`,
      `    ${path}`,
      '',
    );
  }

  return lines.join('\n');
}
