import { describe, expect, it } from 'vitest';

import { loadMortgageRules } from '../finance/rules.js';
import { owningVsRenting } from './affordability.js';

const rules = loadMortgageRules();

/** Menemen, 29.07.2026: the first real reading this was built against. */
const GAZI = { name: 'Gazi Mustafa Kemal', sale_per_m2: 42_590, rent_per_m2: 309 };
const KASIMPASA = { name: 'Kasımpaşa', sale_per_m2: 39_470, rent_per_m2: 191 };

describe('owningVsRenting', () => {
  it('says how many times the rent the instalment is', () => {
    // The number a first-home buyer actually decides on: not what the flat
    // yields, but what owning it costs against renting the same one.
    const [gazi] = owningVsRenting(rules, [GAZI], {
      monthlyRate: 2.72,
      months: 120,
      squareMetres: 100,
    });

    expect(gazi?.instalment).toBeCloseTo(84_465, -1);
    expect(gazi?.timesRent).toBeCloseTo(2.73, 2);
  });

  it('ranks the cheapest flat last when its rent is cheaper still', () => {
    // Kasımpaşa is the cheapest place to buy in the district and the worst
    // place to buy instead of renting. Sorting on price would recommend it.
    const ranked = owningVsRenting(rules, [GAZI, KASIMPASA], {
      monthlyRate: 2.72,
      months: 120,
      squareMetres: 100,
    });

    expect(ranked.map((r) => r.name)).toEqual(['Gazi Mustafa Kemal', 'Kasımpaşa']);
    expect(ranked[1]?.price).toBeLessThan(ranked[0]?.price ?? 0);
  });

  it('leaves out a neighbourhood with no rent figure rather than guessing one', () => {
    const ranked = owningVsRenting(rules, [{ name: 'Villakent', sale_per_m2: 55_660 }], {
      monthlyRate: 2.72,
      months: 120,
      squareMetres: 100,
    });

    expect(ranked).toEqual([]);
  });

  it('shows the down payment jumping when a price crosses an LTV bracket', () => {
    // 29 Ekim at 5.345.000 crosses BDDK's 5m boundary: the ratio drops from
    // %70 to %60 and the down payment goes from ~1,5m to 2,14m. The flat is
    // barely dearer; the money needed on the day is 600.000 TRY more.
    //
    // The instalment moves the OTHER way, which is why this needs looking up by
    // name rather than by position: borrowing less costs less per month, so the
    // dearer flat sorts better on times-rent while being far harder to reach.
    // That is exactly the trap the column exists to show.
    const ranked = owningVsRenting(
      rules,
      [
        { name: 'altında', sale_per_m2: 49_000, rent_per_m2: 280 },
        { name: 'üstünde', sale_per_m2: 53_450, rent_per_m2: 284 },
      ],
      { monthlyRate: 2.72, months: 120, squareMetres: 100 },
    );
    const at = (name: string) => ranked.find((r) => r.name === name);

    expect(at('altında')?.downPayment).toBeLessThan(1_500_000);
    expect(at('üstünde')?.downPayment).toBeGreaterThan(2_000_000);
    expect(at('üstünde')?.instalment).toBeLessThan(at('altında')?.instalment ?? 0);
  });
});
