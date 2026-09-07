import { describe, expect, it } from 'vitest';

import { coverageByDistrict, coverageByProvince } from './coverage.js';
import { IZMIR_DISTRICTS } from './izmir.js';
import { TURKEY_PROVINCES } from './turkey.js';

const reading = (place: string, mahalle: number) => ({
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
    const counts = coverageByDistrict([reading('İzmir / Çiğli', 28)]);

    expect(counts.get('Çiğli')).toBe(28);
  });

  it('leaves a district nobody has read out of the counts entirely', () => {
    // Absent, not zero. A district with no reading and a district read and
    // found empty are different answers, and the map must not print the second
    // when it means the first.
    const counts = coverageByDistrict([reading('İzmir / Çiğli', 28)]);

    expect(counts.has('Menemen')).toBe(false);
  });

  it('ignores a reading that was superseded', () => {
    // This is the whole point of counting current readings. Counted, a
    // correction would make a district look better covered the more often it
    // was re-read — a correction reading as coverage.
    const live = reading('İzmir / Menemen', 21);
    const counts = coverageByDistrict([
      { ...live, earlier: [{ ...reading('İzmir / Menemen', 21), corrected: true }] },
    ]);

    expect(counts.get('Menemen')).toBe(21);
  });

  it('adds up two readings of different districts under one province', () => {
    const counts = coverageByDistrict([
      reading('İzmir / Çiğli', 28),
      reading('İzmir / Menemen', 21),
    ]);

    expect([...counts.values()].reduce((sum, n) => sum + n, 0)).toBe(49);
  });

  it('leaves out a reading that found no mahalle at all', () => {
    // The schema allows an empty array. Counted, it would put a nought on the
    // map — "looked and found nothing" — which is not what an empty run means
    // and not an answer this record can make.
    expect(coverageByDistrict([reading('İzmir / Çiğli', 0)]).has('Çiğli')).toBe(false);
  });

  it('ignores a place outside the province the map draws', () => {
    // The map is İzmir. A Manisa reading is real data and must not be silently
    // attached to a district it has nothing to do with.
    const counts = coverageByDistrict([reading('Manisa / Turgutlu', 9)]);

    expect(counts.size).toBe(0);
  });

  it('knows every district by the name the record writes', () => {
    // The join is on the Turkish spelling. A transliterated or mangled name in
    // the shapes would silently count nothing, and an empty map looks exactly
    // like a province nobody has researched.
    const names = IZMIR_DISTRICTS.map((district) => district.name);

    expect(names).toHaveLength(30);
    expect(names).toContain('Çiğli');
    expect(names).toContain('Menemen');
    expect(names).toContain('Karşıyaka');
    expect(names).toContain('Bayındır');
  });
});

describe('what the country map counts', () => {
  it('rolls a province up from the districts inside it', () => {
    const counts = coverageByProvince([
      reading('İzmir / Çiğli', 28),
      reading('İzmir / Menemen', 21),
    ]);

    expect(counts.get('İzmir')).toBe(49);
  });

  it('counts a province the district layer knows nothing about', () => {
    // The district map is İzmir only. The country map is not, and a reading in
    // Manisa is real — dropping it because no district shapes exist for that
    // province would make the record look smaller than it is.
    expect(coverageByProvince([reading('Manisa / Turgutlu', 9)]).get('Manisa')).toBe(9);
  });

  it('leaves a province nobody has read out of the counts', () => {
    expect(coverageByProvince([reading('İzmir / Çiğli', 28)]).has('Ankara')).toBe(false);
  });

  it('leaves out a reading that found no mahalle', () => {
    expect(coverageByProvince([reading('İzmir / Çiğli', 0)]).size).toBe(0);
  });

  it('knows all eighty-one provinces by the name the record writes', () => {
    // Written out by hand for the same reason as the districts: the source's
    // Turkish field has lost the dotless ı, so "Aydın" arrives as "Aydin" and
    // "Şanlıurfa" as "Şanliurfa". A mangled name here would silently count
    // nothing, and an uncounted province looks exactly like an unresearched one.
    const names = TURKEY_PROVINCES.map((province) => province.name);

    expect(names).toHaveLength(81);
    expect(names).toContain('İzmir');
    expect(names).toContain('Aydın');
    expect(names).toContain('Şanlıurfa');
    expect(names).toContain('Ağrı');
    expect(names).toContain('Kırıkkale');
  });

  it('draws every district of İzmir inside the İzmir province shape', () => {
    // Both layers come from the same release of the same dataset, so the
    // district p-codes carry the province p-code as their prefix. If a future
    // regeneration mixed releases this is what would notice.
    const izmir = TURKEY_PROVINCES.find((province) => province.name === 'İzmir');

    expect(izmir?.pcode).toBe('TUR035');
    expect(IZMIR_DISTRICTS.every((district) => district.pcode.startsWith('TUR035'))).toBe(true);
  });
});
