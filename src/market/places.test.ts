import { describe, expect, it } from 'vitest';

import { comparable } from './places.js';

const menemen = {
  place: 'İzmir / Menemen',
  dated: '2026-07-29',
  earlier: [],
  corrected: false,
  neighbourhoods: [
    {
      name: '30 Ağustos',
      sale_per_m2: 52_857,
      rent_per_m2: 288,
      listing_count: 40,
      basis: 'listing_median' as const,
      confidence: 'medium' as const,
      source: 'İlan, 3+1, 55-175 m²',
    },
    {
      name: 'Ulukent',
      sale_per_m2: 45_000,
      listing_count: 3,
      basis: 'listing_median' as const,
      confidence: 'low' as const,
      source: 'İlan, 3+1, 55-175 m²',
    },
  ],
};

const cigli = {
  ...menemen,
  place: 'İzmir / Çiğli',
  neighbourhoods: [
    {
      name: 'Küçük Çiğli',
      sale_per_m2: 48_000,
      rent_per_m2: 250,
      listing_count: 22,
      basis: 'listing_median' as const,
      confidence: 'medium' as const,
      source: 'İlan, 2+1, 55-175 m²',
    },
  ],
};

describe('the places a reader can put side by side', () => {
  it('gathers every neighbourhood the record has read, across districts', () => {
    // Çiğli and Menemen are separate reports, so today comparing one against
    // the other takes two scrolls and a memory — and that is exactly the
    // comparison being made: the reader lives in one and is considering the
    // other.
    expect(comparable([menemen, cigli]).map((entry) => entry.name)).toEqual([
      '30 Ağustos',
      'Küçük Çiğli',
      'Ulukent',
    ]);
  });

  it('carries the province and district each one belongs to', () => {
    const [first] = comparable([menemen]);

    expect(first?.province).toBe('İzmir');
    expect(first?.district).toBe('Menemen');
  });

  it('carries the reliability with the figure, or the comparison overstates', () => {
    // A row built from a 40-listing median and a 3-listing median is not two
    // neighbourhoods compared, it is a measurement beside a guess.
    const thin = comparable([menemen]).find((entry) => entry.name === 'Ulukent');

    expect(thin?.listing_count).toBe(3);
    expect(thin?.confidence).toBe('low');
  });

  it('carries the band, so two readings of different mixes are not subtracted', () => {
    expect(comparable([cigli])[0]?.source).toContain('2+1');
  });

  it('leaves out a neighbourhood with no price, which cannot be compared on one', () => {
    const priceless = {
      ...menemen,
      neighbourhoods: [{ ...menemen.neighbourhoods[0]!, sale_per_m2: undefined }],
    };

    expect(comparable([priceless])).toEqual([]);
  });
});
