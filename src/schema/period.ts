const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^(\d{4})-(\d{2})$/;
const WEEK = /^(\d{4})-W(\d{2})$/;

const MS_PER_DAY = 86_400_000;

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
