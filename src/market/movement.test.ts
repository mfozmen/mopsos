import { describe, expect, it } from 'vitest';

import { movedIn } from './movement.js';

const hood = (name: string, sale: number, count: number, source = 'İlan, 3+1') => ({
  name,
  sale_per_m2: sale,
  listing_count: count,
  source,
});

describe('what moved in a district between two readings', () => {
  it('reports the change per neighbourhood, not per district', () => {
    // A district median moves when the mix of neighbourhoods read changes, with
    // no price moving at all. The unit of the decision is a mahalle anyway.
    const now = { neighbourhoods: [hood('A', 52_000, 40)] };
    const then = { neighbourhoods: [hood('A', 50_000, 40)] };

    expect(movedIn(now, then)).toEqual([
      { name: 'A', from: 50_000, to: 52_000, ratio: 0.04, counts: [40, 40] },
    ]);
  });

  it('says nothing about a neighbourhood the earlier reading did not cover', () => {
    const now = { neighbourhoods: [hood('A', 52_000, 40), hood('B', 40_000, 10)] };
    const then = { neighbourhoods: [hood('A', 50_000, 40)] };

    expect(movedIn(now, then).map((move) => move.name)).toEqual(['A']);
  });

  it('refuses a comparison across different bands', () => {
    // Two medians taken on different room counts are not comparable, and
    // subtracting them anyway is the mistake the band is recorded to prevent.
    const now = { neighbourhoods: [hood('A', 52_000, 40, 'İlan, 3+1')] };
    const then = { neighbourhoods: [hood('A', 50_000, 40, 'İlan, 2+1')] };

    expect(movedIn(now, then)).toEqual([]);
  });

  it('refuses when either side has no price', () => {
    const now = { neighbourhoods: [{ name: 'A', listing_count: 40, source: 'İlan, 3+1' }] };
    const then = { neighbourhoods: [hood('A', 50_000, 40)] };

    expect(movedIn(now, then)).toEqual([]);
  });

  it('carries both listing counts, since a move is only as good as its thinner side', () => {
    const now = { neighbourhoods: [hood('A', 52_000, 40)] };
    const then = { neighbourhoods: [hood('A', 50_000, 3)] };

    expect(movedIn(now, then)[0]).toMatchObject({ counts: [3, 40] });
  });
});
