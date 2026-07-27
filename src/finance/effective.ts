export class IncalculableCostError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'IncalculableCostError';
  }
}

export interface LoanCashflow {
  /** The face amount of the loan — what the instalments are sized against. */
  principal: number;
  /** Interest taken at drawdown, so it never reaches the borrower. */
  upfrontInterest?: number;
  /** Allocation, mortgage registration and anything else payable up front. */
  fees?: number;
  monthlyPayment: number;
  months: number;
}

const MAX_MONTHLY_RATE = 100;
const PRECISION = 1e-10;
const ITERATIONS = 200;

function presentValue(payment: number, months: number, monthlyRate: number): number {
  if (monthlyRate === 0) return payment * months;
  const factor = 1 + monthlyRate;
  return (payment * (1 - factor ** -months)) / monthlyRate;
}

/**
 * What the money actually costs, as a monthly percentage.
 *
 * The quoted rate prices the face amount. What matters is the rate on what the
 * borrower actually receives, after interest taken at drawdown and fees paid on
 * the day. A loan advertised at %1,99 that keeps a third of itself up front is
 * not a %1,99 loan, and no amount of reading the conditions turns that sentence
 * into a number the borrower can compare.
 *
 * Solved by bisection rather than Newton: present value is monotonic in the
 * rate, bisection cannot diverge, and two hundred halvings of a 0-100% bracket
 * is far more precision than money has.
 */
export function effectiveMonthlyRate(flow: LoanCashflow): number {
  const received = flow.principal - (flow.upfrontInterest ?? 0) - (flow.fees ?? 0);

  if (received <= 0) {
    throw new IncalculableCostError(
      'Upfront charges consume the whole loan, so nothing is borrowed and there is no rate',
    );
  }

  const repaid = flow.monthlyPayment * flow.months;
  if (repaid <= received) {
    throw new IncalculableCostError(
      `Instalments total ${String(repaid)} against ${String(received)} received — ` +
        'that is not a loan at any positive rate',
    );
  }

  let low = 0;
  let high = MAX_MONTHLY_RATE / 100;

  for (let index = 0; index < ITERATIONS; index += 1) {
    const middle = (low + high) / 2;
    const value = presentValue(flow.monthlyPayment, flow.months, middle);

    if (Math.abs(value - received) < PRECISION) return middle * 100;
    // Present value falls as the rate rises, so overshooting means going higher.
    if (value > received) low = middle;
    else high = middle;
  }

  return ((low + high) / 2) * 100;
}

/**
 * A monthly rate as a yearly one, compounded.
 *
 * Turkish rate sheets quote monthly and are often read as "times twelve", which
 * understates badly: %2,88 a month is %40,55 a year, not %34,56.
 */
export function annualCostRate(monthlyRatePercent: number): number {
  return (1 + monthlyRatePercent / 100) ** 12 - 1;
}
