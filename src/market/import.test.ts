import { describe, expect, it } from 'vitest';

import { InvalidListingsError, listingsToReport } from './import.js';

// A measurement band and CSV column names, not addresses.
const BAND = 'sahibinden, 3+1 satılık daire, 55–175 m², 29.07.2026, elle toplandı'; // scan-ignore: example

const CSV = `mahalle,m2,fiyat
Egekent 2,110,4750000
Egekent 2,95,4100000
Egekent 2,120,5200000
Ataşehir,105,5400000
Ataşehir,130,6600000
`;

const WHERE = { province: 'İzmir', district: 'Çiğli', capturedOn: '2026-07-29', source: BAND };

describe('listingsToReport', () => {
  it('turns a person’s CSV into the same report a scout would have written', () => {
    const report = listingsToReport(CSV, WHERE);

    expect(report.schema_version).toBe(1);
    expect(report.province).toBe('İzmir');
    expect(report.neighbourhoods.map((n) => n.name).sort()).toEqual(['Ataşehir', 'Egekent 2']);
  });

  it('takes the median per square metre, not the median price', () => {
    // 4.100.000/95 = 43.157,89 · 4.750.000/110 = 43.181,82 · 5.200.000/120 = 43.333,33.
    // The median of the three RATIOS, which is what a price per square metre is.
    // Median price over median size is a different number and a wrong one.
    const egekent = listingsToReport(CSV, WHERE).neighbourhoods.find((n) => n.name === 'Egekent 2');

    expect(egekent?.sale_per_m2).toBe(43_182);
    expect(egekent?.listing_count).toBe(3);
  });

  it('marks a thin neighbourhood as low confidence without being told', () => {
    // Two listings is not a median, and a person entering data by hand has no
    // more reason than a scout to be trusted about how thin their own sample is.
    const report = listingsToReport(CSV, WHERE);

    expect(report.neighbourhoods.find((n) => n.name === 'Ataşehir')?.confidence).toBe('low');
    expect(report.neighbourhoods.find((n) => n.name === 'Egekent 2')?.confidence).toBe('low');
  });

  it('records what was measured, because a figure with no source is not evidence', () => {
    expect(listingsToReport(CSV, WHERE).neighbourhoods[0]?.source).toBe(BAND);
  });

  it('refuses a row it cannot read rather than dropping it quietly', () => {
    // A dropped row is a median computed over data nobody knows is missing.
    expect(() => listingsToReport(`${CSV}Balatçık,,3900000\n`, WHERE)).toThrow(/Balatçık/);
    expect(() => listingsToReport(`${CSV}Balatçık,90,bilinmiyor\n`, WHERE)).toThrow(
      InvalidListingsError,
    );
  });

  it('refuses a file with no rows at all', () => {
    expect(() => listingsToReport('mahalle,m2,fiyat\n', WHERE)).toThrow(/satır/i);
  });

  it('reads Turkish numbers, since that is what gets pasted', () => {
    const turkish = 'mahalle,m2,fiyat\nEgekent 2,110,"4.750.000"\nEgekent 2,110,"4.750.000"\n'; // scan-ignore: example

    expect(listingsToReport(turkish, WHERE).neighbourhoods[0]?.sale_per_m2).toBe(43_182);
  });
});
