export const ENERGY_CLASSES = ['A_B', 'C', 'OTHER'] as const;
export type EnergyClass = (typeof ENERGY_CLASSES)[number];

/** One row of the BDDK loan-to-value table. */
export interface LoanToValueBracket {
  /** Inclusive upper bound of the bracket; null on the last, open-ended one. */
  value_up_to: number | null;
  ratios: Record<EnergyClass, number>;
}

/**
 * The pinned rules, shaped as `data/mortgage-rules.json`.
 *
 * Passed in rather than read from disk: this module has to run unchanged in the
 * browser, where the user types numbers into a self-contained page. Loading
 * lives in `rules.ts`, which is Node-only on purpose.
 */
export interface MortgageRules {
  loan_to_value: { brackets: LoanToValueBracket[] };
  /**
   * Conventional, not legal. There is no statutory maximum maturity for a
   * housing loan — madde 12(3) excludes them from the consumer-loan regime by
   * name. This is what banks offer.
   */
  term: { conventional_max_months: number };
  /**
   * BDDK 10656, kept in force by 11364: the ratio is reduced by 75% when the
   * borrower already owns a home. Absent means unrecorded, not inapplicable.
   */
  existing_home_reduction?: { multiplier: number };
}

export class InvalidLoanError extends Error {
  constructor(readonly problems: string[]) {
    super(`Loan cannot be calculated:\n  ${problems.join('\n  ')}`);
    this.name = 'InvalidLoanError';
  }
}

function checkLoan(principal: number, monthlyRatePercent: number, months: number): void {
  const problems: string[] = [];

  if (!(principal > 0)) {
    problems.push(`principal must be above 0 (got ${String(principal)})`);
  }

  if (!(monthlyRatePercent >= 0)) {
    problems.push(
      `monthly rate must not be negative (got ${String(monthlyRatePercent)}). ` +
        'Turkish housing loan rates are quoted per month, so 2.79 means 2.79%/month.',
    );
  }

  if (!Number.isInteger(months) || months < 1) {
    problems.push(`months must be a whole number of at least 1 (got ${String(months)})`);
  }

  if (problems.length > 0) throw new InvalidLoanError(problems);
}

// 'OTHER' is the honest answer for an unrated home; an unrecognised string is a
// caller mistake, and reading `ratios[key]` would hand back undefined and turn
// the whole calculation into NaN several steps later.
function checkEnergyClass(energyClass: EnergyClass): void {
  if (!(ENERGY_CLASSES as readonly string[]).includes(energyClass)) {
    throw new InvalidLoanError([
      `unknown energy class ${JSON.stringify(energyClass)} ` +
        `(expected one of ${ENERGY_CLASSES.join(', ')})`,
    ]);
  }
}

/**
 * Standard annuity instalment.
 *
 * No KKDF and no BSMV anywhere in this module. Housing finance loans are exempt
 * under Law 5582, and the pinned rules record both rates as 0. Consumer loans
 * are NOT exempt — anyone reusing this for a consumer loan has to add them, and
 * would otherwise never notice they are missing.
 */
export function monthlyPayment(
  principal: number,
  monthlyRatePercent: number,
  months: number,
): number {
  checkLoan(principal, monthlyRatePercent, months);

  const rate = monthlyRatePercent / 100;
  // The annuity formula is 0/0 at a zero rate. Rare in Turkey, but campaign
  // loans do get advertised at 0% and the NaN would propagate silently.
  if (rate === 0) return principal / months;
  return (principal * rate) / (1 - (1 + rate) ** -months);
}

export interface Instalment {
  /** 1-based, the way a bank's payment plan numbers them. */
  month: number;
  payment: number;
  interest: number;
  principal: number;
  remaining: number;
}

/**
 * The payment plan (ödeme planı) a bank would hand over.
 *
 * The last row's principal is whatever is left rather than the formula's share,
 * so rounding drift over 120 months cannot leave a residue on the loan. The
 * final instalment therefore differs from the others by a few kuruş, which is
 * what banks do too.
 */
export function amortisation(
  principal: number,
  monthlyRatePercent: number,
  months: number,
): Instalment[] {
  const rate = monthlyRatePercent / 100;
  const payment = monthlyPayment(principal, monthlyRatePercent, months);

  const schedule: Instalment[] = [];
  let remaining = principal;

  for (let month = 1; month <= months; month += 1) {
    const interest = remaining * rate;
    const repaid = month === months ? remaining : payment - interest;
    remaining -= repaid;
    schedule.push({
      month,
      payment: repaid + interest,
      interest,
      principal: repaid,
      remaining,
    });
  }

  return schedule;
}

/**
 * The term cap, which lives here rather than in `monthlyPayment` because it is
 * a rule and the annuity is arithmetic. The same formula answers "what would
 * 150 months cost" honestly; what BDDK forbids is signing it.
 */
export function assertTermAllowed(rules: MortgageRules, months: number): void {
  if (!Number.isInteger(months) || months < 1) {
    throw new InvalidLoanError([
      `months must be a whole number of at least 1 (got ${String(months)})`,
    ]);
  }

  if (months > rules.term.conventional_max_months) {
    // Not "exceeds the legal maximum": there isn't one. Saying so would put a
    // false statement of law in front of the reader.
    throw new InvalidLoanError([
      `term of ${String(months)} months is longer than the ` +
        `${String(rules.term.conventional_max_months)} months banks conventionally offer`,
    ]);
  }
}

/** Whether the borrower's household already owns a home. */
export interface BorrowerCircumstances {
  ownsHome?: boolean;
}

/**
 * The BDDK loan-to-value ratio for a housing value and energy class.
 *
 * Bounds are inclusive — "5.000.000 TL'ye kadar" includes 5,000,000 itself —
 * and the last bracket is open-ended.
 *
 * Reduced by 75% when the household already owns a home (BDDK 10656, kept in
 * force by 11364). It is the largest single effect in the rules: leaving it out
 * overstates a second-home buyer's borrowing power fourfold. Ownership defaults
 * to false because this tool exists to help buy a first home — but the caller
 * should ask, since the answer quadruples the required deposit.
 */
export function maxLoanToValue(
  rules: MortgageRules,
  housingValue: number,
  energyClass: EnergyClass,
  borrower: BorrowerCircumstances = {},
): number {
  checkEnergyClass(energyClass);

  const bracket = rules.loan_to_value.brackets.find(
    (candidate) => candidate.value_up_to === null || housingValue <= candidate.value_up_to,
  );

  /* v8 ignore next -- unreachable: the loader rejects a table without an open-ended bracket */
  if (!bracket) throw new Error(`No loan-to-value bracket covers ${housingValue}`);

  const ratio = bracket.ratios[energyClass];
  if (borrower.ownsHome !== true) return ratio;

  const reduction = rules.existing_home_reduction;
  if (reduction === undefined) {
    throw new InvalidLoanError([
      'the borrower already owns a home, but the rules carry no existing_home_reduction — ' +
        'refusing to apply the full ratio, which would overstate the loan fourfold',
    ]);
  }

  return ratio * reduction.multiplier;
}

export function maxLoan(
  rules: MortgageRules,
  housingValue: number,
  energyClass: EnergyClass,
  borrower: BorrowerCircumstances = {},
): number {
  return housingValue * maxLoanToValue(rules, housingValue, energyClass, borrower);
}

/** What the buyer has to bring: the part of the price the loan may not cover. */
export function minDownPayment(
  rules: MortgageRules,
  housingValue: number,
  energyClass: EnergyClass,
  borrower: BorrowerCircumstances = {},
): number {
  return housingValue - maxLoan(rules, housingValue, energyClass, borrower);
}

export interface AffordabilityInput {
  rules: MortgageRules;
  /** What the buyer can pay every month, in TRY. */
  monthlyBudget: number;
  downPayment: number;
  monthlyRatePercent: number;
  months: number;
  energyClass: EnergyClass;
  /** Quadruples the deposit needed when true — see maxLoanToValue. */
  ownsHome?: boolean;
}

/** The largest loan a fixed monthly payment retires over the term — the annuity, inverted. */
function serviceableLoan(
  monthlyBudget: number,
  monthlyRatePercent: number,
  months: number,
): number {
  const rate = monthlyRatePercent / 100;
  // Same 0/0 as the annuity, from the other side.
  if (rate === 0) return monthlyBudget * months;
  return (monthlyBudget * (1 - (1 + rate) ** -months)) / rate;
}

/**
 * The highest housing price this buyer can reach.
 *
 * The circularity: the LTV ratio depends on which bracket the price falls in,
 * and the price depends on the ratio. Solved by evaluating every bracket
 * exactly rather than iterating, which converges on the wrong side of an edge.
 *
 * Within one bracket the ratio r is constant, so three limits apply and the
 * price is the smallest of them:
 *   - the budget:  serviceable loan + down payment
 *   - the LTV rule: down payment must cover (1 − r) of the price, so the price
 *                   cannot exceed downPayment / (1 − r)
 *   - the bracket itself: its upper bound, since above it r no longer applies
 * A bracket only counts if the resulting price actually lands inside it. The
 * answer is the highest price over all brackets that do.
 *
 * The third limit is the one that is easy to miss and the reason iteration goes
 * wrong. The requirement jumps at every edge — at 5,000,000 an A/B home needs
 * 500,000 down, at 5,000,001 it needs 1,000,000.20 — so the reachable set has
 * gaps, and for a whole range of down payments the best price is an edge value
 * where neither the budget nor the ratio is binding on its own.
 */
export function affordability({
  rules,
  monthlyBudget,
  downPayment,
  monthlyRatePercent,
  months,
  energyClass,
  ownsHome,
}: AffordabilityInput): number {
  const problems: string[] = [];

  if (!(monthlyBudget >= 0)) {
    problems.push(`monthly budget must not be negative (got ${String(monthlyBudget)})`);
  }

  if (!(monthlyRatePercent >= 0)) {
    problems.push(`monthly rate must not be negative (got ${String(monthlyRatePercent)})`);
  }

  if (!(downPayment >= 0)) {
    problems.push(`down payment must not be negative (got ${String(downPayment)})`);
  }

  if (problems.length > 0) throw new InvalidLoanError(problems);

  assertTermAllowed(rules, months);

  checkEnergyClass(energyClass);

  const byBudget = serviceableLoan(monthlyBudget, monthlyRatePercent, months) + downPayment;

  let best = 0;
  let lowerBound = 0;

  // The reduction applies to every bracket, so it belongs inside the loop with
  // the ratio rather than as a correction afterwards.
  const reduction = ownsHome === true ? (rules.existing_home_reduction?.multiplier ?? 0) : 1;

  if (ownsHome === true && rules.existing_home_reduction === undefined) {
    throw new InvalidLoanError([
      'the borrower already owns a home, but the rules carry no existing_home_reduction — ' +
        'refusing to apply the full ratio, which would overstate the price fourfold',
    ]);
  }

  for (const bracket of rules.loan_to_value.brackets) {
    const byRule = downPayment / (1 - bracket.ratios[energyClass] * reduction);
    // Rounded to the kuruş before the bracket is judged. `1 - 0.8` is
    // 0.19999999999999996, which puts the limit a billionth of a lira above the
    // edge and makes a bracket the buyer cannot actually reach look reachable.
    const price =
      Math.round(
        Math.min(byBudget, byRule, bracket.value_up_to ?? Number.POSITIVE_INFINITY) * 100,
      ) / 100;

    if (price > lowerBound) best = Math.max(best, price);

    if (bracket.value_up_to === null) break;
    lowerBound = bracket.value_up_to;
  }

  return best;
}

export function totalRepayment(
  principal: number,
  monthlyRatePercent: number,
  months: number,
): number {
  return monthlyPayment(principal, monthlyRatePercent, months) * months;
}

export function totalInterest(
  principal: number,
  monthlyRatePercent: number,
  months: number,
): number {
  return totalRepayment(principal, monthlyRatePercent, months) - principal;
}
