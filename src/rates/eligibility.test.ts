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

  it.each([
    'evlilik süresi 3 yılı geçmemiş olmalı',
    'evlenme tarihi üzerinden 3 yıl geçmemiş',
    'evlendikten sonraki ilk 3 yıl içinde başvuru',
    'nikah tarihinden itibaren 36 ay',
  ])('catches the same gate written another way: %s', (conditions) => {
    // One bank's phrasing is not the vocabulary. A gate missed here does not
    // merely leave the offer showing — it shows it as open to everyone, which
    // is a claim the record never made.
    expect(gatedOn({ product: 'Konut Kredisi', monthly_rate: 2.6, conditions })).toEqual([
      'newlywed',
    ]);
  });

  it.each([
    'evlenmemiş olması',
    'evlenmeden önce başvurmuş olmak',
    'evlenmeyen',
    'evlilik şartı aranmaz',
    'evlilik durumuna bakılmaksızın başvurulabilir',
  ])('does not read the opposite condition as a marriage gate: %s', (conditions) => {
    // A product for people who are NOT married reads through the same root.
    // Flagged, it would be dimmed for exactly the readers it is meant for —
    // hiding a rate they could have had, which is the worse direction.
    expect(gatedOn({ product: 'Genç Konut Kredisi', monthly_rate: 2.6, conditions })).toEqual([]);
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
