import { describe, expect, it } from 'vitest';

import type { Verdict } from '../schema/types.js';
import { dueVerdicts, formatDueReport, localIsoDate, type ResolvableVerdict } from './due.js';

const BASE: Verdict = {
  schema_version: 1,
  id: '2026-07-26-housing-tr-kfe-q3',
  seer: 'cautious',
  asset_class: 'housing',
  question: 'Will the TCMB house price index for September 2026 be above 41.5?',
  probability: 0.62,
  created_at: '2026-07-26',
  due_at: '2026-09-30',
  resolution: {
    source: 'evds',
    series: 'TP.KTF17',
    reference_period: '2026-09',
    check_after: '2026-10-16',
    rule: 'value > 41.5',
    print: 'first',
  },
};

function verdict(id: string, checkAfter: string): Verdict {
  return { ...BASE, id, resolution: { ...BASE.resolution, check_after: checkAfter } };
}

function input(verdicts: Verdict[]): ResolvableVerdict[] {
  return verdicts.map((v) => ({ verdict: v, path: `research/run/${v.id}.md` }));
}

describe('dueVerdicts', () => {
  it('lists a verdict whose check date has passed', () => {
    const due = dueVerdicts(
      input([verdict('2026-07-26-a', '2026-10-16')]),
      new Set(),
      '2026-10-20',
    );

    expect(due.map((entry) => entry.verdict.id)).toEqual(['2026-07-26-a']);
    expect(due[0]?.days_overdue).toBe(4);
  });

  it('includes a verdict due exactly today, since the value exists from that day', () => {
    const due = dueVerdicts(
      input([verdict('2026-07-26-a', '2026-10-16')]),
      new Set(),
      '2026-10-16',
    );

    expect(due).toHaveLength(1);
    expect(due[0]?.days_overdue).toBe(0);
  });

  it('leaves out a verdict whose value cannot exist yet', () => {
    expect(
      dueVerdicts(input([verdict('2026-07-26-a', '2026-10-16')]), new Set(), '2026-10-15'),
    ).toEqual([]);
  });

  it('leaves out a verdict that already has an outcome', () => {
    const resolved = new Set(['2026-07-26-a']);

    expect(
      dueVerdicts(input([verdict('2026-07-26-a', '2026-10-16')]), resolved, '2026-11-01'),
    ).toEqual([]);
  });

  it('puts the most overdue first, because that is the one rotting', () => {
    const due = dueVerdicts(
      input([
        verdict('2026-07-26-recent', '2026-10-16'),
        verdict('2026-07-26-ancient', '2026-08-01'),
      ]),
      new Set(),
      '2026-10-20',
    );

    expect(due.map((entry) => entry.verdict.id)).toEqual([
      '2026-07-26-ancient',
      '2026-07-26-recent',
    ]);
  });

  it('carries the path, so the reader can open the file it names', () => {
    const due = dueVerdicts(
      input([verdict('2026-07-26-a', '2026-10-16')]),
      new Set(),
      '2026-10-20',
    );

    expect(due[0]?.path).toBe('research/run/2026-07-26-a.md');
  });
});

describe('formatDueReport', () => {
  const due = dueVerdicts(input([verdict('2026-07-26-a', '2026-10-16')]), new Set(), '2026-10-20');

  it('says plainly when nothing is due', () => {
    expect(formatDueReport([], '2026-10-20')).toBe('Nothing to resolve as of 2026-10-20.');
  });

  it('names the verdict, how overdue it is, and the file to open', () => {
    const report = formatDueReport(due, '2026-10-20');

    expect(report).toContain('2026-07-26-a');
    expect(report).toContain('4d overdue');
    expect(report).toContain('research/run/2026-07-26-a.md');
  });

  it('shows the rule, so the reader knows what to measure', () => {
    expect(formatDueReport(due, '2026-10-20')).toContain('value > 41.5');
  });
});

describe('localIsoDate', () => {
  it('takes the calendar date where the reader is, not in UTC', () => {
    // Turkey is UTC+3, so for the first three hours after local midnight
    // toISOString() still reports the previous day — and a verdict would look
    // due a day late. The publication calendar this is measured against is
    // Turkish, so the local day is the right frame.
    expect(localIsoDate(new Date(2026, 9, 16, 1, 30))).toBe('2026-10-16');
  });

  it('pads single-digit months and days', () => {
    expect(localIsoDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});
