import {
  maxLoan,
  minDownPayment,
  type MortgageRules,
  monthlyPayment,
} from '../finance/mortgage.js';

export interface RankedNeighbourhood {
  name: string;
  /** What a flat of the chosen size costs at the neighbourhood's asking median. */
  price: number;
  /** The least the BDDK rules allow to be put down for it. */
  downPayment: number;
  instalment: number;
  rent: number;
  /** The instalment as a multiple of the rent. Lower is better. */
  timesRent: number;
}

export interface Assumptions {
  /** The real monthly cost of the cheapest offer in the record, not its headline. */
  monthlyRate: number;
  months: number;
  squareMetres: number;
}

/**
 * What owning costs against renting, neighbourhood by neighbourhood.
 *
 * The question a first-home buyer actually decides on. Gross yield answers
 * "what would this flat return", which is the landlord's question; someone who
 * will live in it wants to know how much more the instalment is than the rent
 * they would otherwise pay.
 *
 * It reorders the list. Menemen's cheapest neighbourhood to buy in is its worst
 * one to buy instead of rent — Kasımpaşa is 3.947.000 against Gazi Mustafa
 * Kemal's 4.259.000 and costs 4,10 times its rent against 2,73 — so a table
 * sorted on price recommends exactly the wrong place.
 *
 * Worked out here rather than recorded by the scout, for the same reason gross
 * yield is: it follows from figures already in the report plus the rate record,
 * and a number an agent supplies separately can disagree with the numbers it
 * came from.
 *
 * The energy class is taken as unknown, which is the pessimistic bracket. A
 * listing median covers flats of every class and assuming better would overstate
 * how much can be borrowed.
 */
export function owningVsRenting(
  rules: MortgageRules,
  neighbourhoods: { name: string; sale_per_m2?: number; rent_per_m2?: number }[],
  { monthlyRate, months, squareMetres }: Assumptions,
): RankedNeighbourhood[] {
  return neighbourhoods
    .flatMap((n) => {
      // No rent, no comparison. Filling the gap with a district average would
      // put a made-up number in the column the decision is read from.
      if (n.sale_per_m2 === undefined || n.rent_per_m2 === undefined) return [];

      const price = n.sale_per_m2 * squareMetres;
      const rent = n.rent_per_m2 * squareMetres;
      const loan = maxLoan(rules, price, 'OTHER', { ownsHome: false });
      const instalment = monthlyPayment(loan, monthlyRate, months);

      return [
        {
          name: n.name,
          price,
          downPayment: minDownPayment(rules, price, 'OTHER', { ownsHome: false }),
          instalment,
          rent,
          timesRent: instalment / rent,
        },
      ];
    })
    .sort((a, b) => a.timesRent - b.timesRent);
}
