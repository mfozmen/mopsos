import { describe, expect, it } from 'vitest';

import { allowsSource, at, parentOf, reliabilityOf, sourcesFor } from './level.js';

describe('a place', () => {
  it('resolves upward to the district and the province it sits in', () => {
    const place = at('İzmir', 'Menemen', '30 Ağustos');

    expect(parentOf(place)?.name).toBe('Menemen');
    expect(parentOf(parentOf(place))?.name).toBe('İzmir');
  });

  it('stops at the province, which sits inside nothing this record knows', () => {
    expect(parentOf(at('İzmir'))).toBeUndefined();
  });

  it('keeps Turkish names as they are written', () => {
    // No transliteration anywhere, id included. A slug would fold Çiğli and a
    // hypothetical Cigli onto one identity, and the record would then hold two
    // districts under one name with no way to tell them apart.
    expect(at('İzmir', 'Çiğli').id).toBe('İzmir / Çiğli');
  });

  it('identifies the same place the same way every time', () => {
    expect(at('İzmir', 'Menemen', '30 Ağustos').id).toBe(at('İzmir', 'Menemen', '30 Ağustos').id);
  });

  it('knows which of the three levels it is', () => {
    expect(at('İzmir').level).toBe('province');
    expect(at('İzmir', 'Menemen').level).toBe('district');
    expect(at('İzmir', 'Menemen', '30 Ağustos').level).toBe('neighbourhood');
  });
});

describe('a place that is not one', () => {
  it('refuses no names at all', () => {
    expect(() => at()).toThrow(/one to three/);
  });

  it('refuses a fourth level, because the record has only three', () => {
    // Street, block, building — none of them exist here, and inventing a level
    // silently would give it a reliability class it has no sources for.
    expect(() => at('İzmir', 'Menemen', '30 Ağustos', 'Bir Sokak')).toThrow(/one to three/);
  });
});

describe('what each level can be measured with', () => {
  it('lets a province cite the official series', () => {
    expect(sourcesFor('province')).toContain('evds');
    expect(sourcesFor('province')).toContain('tuik');
  });

  it('refuses a neighbourhood the official series', () => {
    // TCMB publishes no index for a mahalle. A verdict citing one there is
    // citing a number that does not exist, and it would read as the most solid
    // figure on the page.
    expect(allowsSource('neighbourhood', 'evds')).toBe(false);
    expect(allowsSource('neighbourhood', 'tuik')).toBe(false);
  });

  it('leaves a neighbourhood only what we collect ourselves', () => {
    expect(sourcesFor('neighbourhood')).toEqual(['listing_snapshot']);
  });

  it('lets a district use both, because it is measured both ways', () => {
    expect(allowsSource('district', 'tuik')).toBe(true);
    expect(allowsSource('district', 'listing_snapshot')).toBe(true);
    expect(allowsSource('district', 'evds')).toBe(false);
  });

  it('refuses a market close at every level, since no place has one', () => {
    expect(allowsSource('province', 'market_close')).toBe(false);
    expect(allowsSource('district', 'market_close')).toBe(false);
    expect(allowsSource('neighbourhood', 'market_close')).toBe(false);
  });

  it('says how far each level can be trusted, so the three do not read alike', () => {
    expect(reliabilityOf('province')).toBe('official');
    expect(reliabilityOf('district')).toBe('mixed');
    expect(reliabilityOf('neighbourhood')).toBe('collected');
  });
});
