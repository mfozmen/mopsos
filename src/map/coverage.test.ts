import { describe, expect, it } from 'vitest';

import { coverageByDistrict, coverageByProvince, unmatchedPlaces } from './coverage.js';
import { DISTRICTS_BY_PROVINCE } from './districts.js';
import { TURKEY_PROVINCES } from './turkey.js';

const reading = (place: string, mahalle: number) => ({
  file: 'a.json',
  place,
  dated: '2026-07-29',
  neighbourhoods: Array.from({ length: mahalle }, (_, index) => ({
    name: `Mahalle ${String(index)}`,
    sale_per_m2: 40_000,
    listing_count: 12,
    basis: 'listing_median' as const,
    confidence: 'medium' as const,
    source: 'test',
  })),
  earlier: [],
  corrected: false,
});

describe('what the map counts', () => {
  it('counts the mahalle in a district’s current reading', () => {
    expect(coverageByDistrict([reading('İzmir / Çiğli', 28)]).get('İzmir / Çiğli')).toBe(28);
  });

  it('counts a district in a province the record has never touched before', () => {
    // Every province has a district layer now, so the counting cannot be
    // written around the one province that happened to have readings first.
    expect(coverageByDistrict([reading('Manisa / Turgutlu', 9)]).get('Manisa / Turgutlu')).toBe(9);
  });

  it('leaves a district nobody has read out of the counts entirely', () => {
    // Absent, not zero. A district with no reading and a district read and
    // found empty are different answers, and the map must not print the second
    // when it means the first.
    expect(coverageByDistrict([reading('İzmir / Çiğli', 28)]).has('İzmir / Menemen')).toBe(false);
  });

  it('ignores a reading that was superseded', () => {
    // Counted, a correction would make a district look better covered the more
    // often it was re-read.
    const live = reading('İzmir / Menemen', 21);
    const counts = coverageByDistrict([
      { ...live, earlier: [{ ...reading('İzmir / Menemen', 21), corrected: true }] },
    ]);

    expect(counts.get('İzmir / Menemen')).toBe(21);
  });

  it('leaves out a reading that found no mahalle at all', () => {
    expect(coverageByDistrict([reading('İzmir / Çiğli', 0)]).size).toBe(0);
  });

  it('rolls a province up from the districts inside it', () => {
    const counts = coverageByProvince([
      reading('İzmir / Çiğli', 28),
      reading('İzmir / Menemen', 21),
    ]);

    expect(counts.get('İzmir')).toBe(49);
  });
});

describe('a reading whose place matches no shape', () => {
  it('is named rather than silently dropped', () => {
    // The district names are derived from a source with known typos in it. A
    // name that stops matching counts nothing and looks exactly like a district
    // nobody has researched — the one failure this map could hide.
    expect(unmatchedPlaces([reading('İzmir / Cigli', 12)])).toEqual(['İzmir / Cigli']);
  });

  it('says nothing when every reading found its shape', () => {
    expect(unmatchedPlaces([reading('İzmir / Çiğli', 28)])).toEqual([]);
  });

  it('catches a province that matches nothing either', () => {
    expect(unmatchedPlaces([reading('Izmir / Çiğli', 28)])).toEqual(['Izmir / Çiğli']);
  });
});

describe('the shapes themselves', () => {
  it('covers every province with a district layer', () => {
    expect(DISTRICTS_BY_PROVINCE).toHaveLength(81);
    expect(DISTRICTS_BY_PROVINCE.flatMap((entry) => entry.districts)).toHaveLength(973);
  });

  it('names the provinces the same way in both layers', () => {
    // Two files, one join, and the join is the Turkish spelling. A disagreement
    // would leave a province that cannot be zoomed into and nothing to say why.
    const country = new Set(TURKEY_PROVINCES.map((province) => province.name));

    for (const entry of DISTRICTS_BY_PROVINCE) expect(country.has(entry.province)).toBe(true);
  });

  it('spells the districts the way the record does', () => {
    // Spread across the country on purpose: the names are derived by a rule,
    // and these are the shapes that rule has to get right — dotless ı in both
    // positions, İ at the start, and the ones the record already holds.
    const all = new Set(DISTRICTS_BY_PROVINCE.flatMap((e) => e.districts.map((d) => d.name)));

    for (const name of [
      'Çiğli',
      'Menemen',
      'Karşıyaka',
      'Bayındır',
      'Kadıköy',
      'Beşiktaş',
      'Çankaya',
      'Seyhan',
      'Nilüfer',
      'Melikgazi',
      'Şahinbey',
      'İskenderun',
      'Kızıltepe',
      'Sarıyer',
    ]) {
      expect(all).toContain(name);
    }
  });

  it('gives every province a viewBox of its own, which is how zoom works', () => {
    for (const entry of DISTRICTS_BY_PROVINCE) {
      expect(entry.viewBox).toMatch(/^-?[\d.]+ -?[\d.]+ [\d.]+ [\d.]+$/);
    }
  });
});
