import { describe, expect, it } from 'vitest';

import { gatedOn } from './eligibility.js';

describe('who an offer is actually open to', () => {
  it('reads the marriage gate out of the condition the bank published', () => {
    // Halkbank's, verbatim from the record. It is the cheapest real cost in the
    // whole record and the interface had no way to ask whether it applies.
    const offer = {
      product: 'Yeni Evlilere Özel Konut Kredisi',
      monthly_rate: 2.6,
      conditions:
        'Hak sahipliği koşulu: başvuru tarihi itibarıyla eşlerden birinin 35 yaşını doldurmamış ' +
        'olması, resmi nikâh tarihi üzerinden 3 yıldan fazla geçmemiş olması',
    };

    expect(gatedOn(offer)).toEqual(['newlywed']);
  });

  it('reads it from the product name too, since that is where banks put it', () => {
    expect(gatedOn({ product: 'Yeni Evlilere Özel Konut Kredisi', monthly_rate: 2.6 })).toEqual([
      'newlywed',
    ]);
  });

  it('leaves an ordinary offer open to everyone', () => {
    expect(gatedOn({ product: 'Konut Kredisi', monthly_rate: 2.89 })).toEqual([]);
  });

  it('does not read a gate into a rate that merely mentions a spouse', () => {
    // Every first-home rate in the record defines the household as the
    // applicant, their spouse and children under 18. Treating that as a
    // marriage requirement would hide half the table from anyone unmarried.
    const offer = {
      product: 'İlk Evim Konut Kredisi',
      monthly_rate: 3.01,
      conditions:
        'Başvuru sahibi, eşi veya 18 yaşından küçük çocuğu üzerine konut kayıtlı olmamalı',
    };

    expect(gatedOn(offer)).toEqual([]);
  });
});
