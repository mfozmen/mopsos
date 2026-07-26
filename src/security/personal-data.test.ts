import { describe, expect, it } from 'vitest';

import { findPersonalData, isValidTckn } from './personal-data.js';

function kinds(text: string): string[] {
  return findPersonalData(text).map((finding) => finding.kind);
}

describe('isValidTckn', () => {
  it('accepts a number satisfying the checksum', () => {
    expect(isValidTckn('10000000078')).toBe(true);
  });

  it('rejects eleven digits that merely look like one', () => {
    // Without the checksum, any 11-digit number trips the scanner — and this
    // repository is full of them: timestamps, series values, ids.
    expect(isValidTckn('12345678901')).toBe(false);
  });

  it('rejects a number starting with zero', () => {
    expect(isValidTckn('01234567890')).toBe(false);
  });
});

describe('national id', () => {
  it('flags a valid TCKN', () => {
    expect(kinds('TCKN: 10000000078')).toEqual(['national_id']);
  });

  it('says nothing about an eleven-digit number that is not one', () => {
    expect(kinds('The reference is 12345678901.')).toEqual([]);
  });
});

describe('bank details', () => {
  it('flags a Turkish IBAN', () => {
    expect(kinds('TR330006100519786457841326')).toEqual(['iban']);
  });

  it('flags an IBAN written with spaces, as people actually write them', () => {
    expect(kinds('TR33 0006 1005 1978 6457 8413 26')).toEqual(['iban']);
  });
});

describe('phone numbers', () => {
  it.each(['+90 532 123 45 67', '05321234567'])('flags %s', (phone) => {
    expect(kinds(`Call ${phone}`)).toEqual(['phone']);
  });

  it('says nothing about a year or a series value', () => {
    expect(kinds('The 2026 figure was 41.5, up from 39.1.')).toEqual([]);
  });
});

describe("amounts claimed as the author's own", () => {
  it.each([
    'I have 2.4M TRY in savings',
    'my 2,400,000 TRY down payment',
    'benim 2.4M TL birikimim',
    'portfolio: 2400000 TRY',
  ])('flags %s', (text) => {
    expect(kinds(text)).toContain('personal_amount');
  });

  it('says nothing about market data, which is the whole point of the repository', () => {
    expect(
      kinds('The median listing price per m2 for 3+1 flats in Menemen is 45,000 TRY.'),
    ).toEqual([]);
  });

  it('says nothing about a threshold inside a resolution rule', () => {
    expect(kinds("rule: 'value > 41.5'")).toEqual([]);
  });
});

describe('addresses', () => {
  it('flags a street address with a building number', () => {
    expect(kinds('Atatürk Mahallesi, Gül Sokak No: 14/3')).toEqual(['address']);
  });

  it('says nothing about a district named as market geography', () => {
    expect(kinds('3+1 flats in Menemen, İzmir')).toEqual([]);
  });
});

describe('reporting', () => {
  it('reports where the problem is, not just that there is one', () => {
    const findings = findPersonalData('clean line\nTCKN 10000000078\nclean again');

    expect(findings[0]?.line).toBe(2);
  });

  it('reports every distinct problem', () => {
    expect(kinds('10000000078 and TR330006100519786457841326').sort()).toEqual([
      'iban',
      'national_id',
    ]);
  });
});
