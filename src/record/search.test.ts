import { describe, expect, it } from 'vitest';

import { fold, matches, searchable } from './search.js';

describe('folding a Turkish word for search', () => {
  it.each([
    ['Çiğli', 'cigli'],
    ['İzmir', 'izmir'],
    ['Şişli', 'sisli'],
    ['Üsküdar', 'uskudar'],
    ['Ödemiş', 'odemis'],
    ['30 Ağustos', '30 agustos'],
  ])('folds %s to %s', (word, folded) => {
    // The first search anyone types is the one their keyboard makes easy.
    expect(fold(word)).toBe(folded);
  });

  it('folds the dotless ı and the dotted İ to the same letter', () => {
    // Turkish has two i's and a keyboard that produces the wrong one half the
    // time. A search that distinguishes them fails on the word "İzmir".
    expect(fold('Iğdır')).toBe(fold('ığdır'));
  });
});

describe('finding a reading', () => {
  const entry = {
    kind: 'market' as const,
    title: 'İzmir / Çiğli',
    dated: '2026-07-29',
    text: 'sahibinden satılık listesini 14. sayfadan sonra vermedi; bant 3+1 ağırlıklı.',
  };

  it('finds a place by a name typed without its Turkish letters', () => {
    expect(matches(entry, 'cigli')).toBe(true);
  });

  it('searches the prose, not only the names', () => {
    // The most useful sentence in a report is the one a scout wrote about
    // where it stopped. That is where "sahibinden refused" lives.
    expect(matches(entry, 'sahibinden')).toBe(true);
  });

  it('ignores a query that matches nothing', () => {
    expect(matches(entry, 'ankara')).toBe(false);
  });

  it('treats an empty query as no filter rather than as no match', () => {
    expect(matches(entry, '   ')).toBe(true);
  });

  it('needs every word of the query, so a second word narrows', () => {
    expect(matches(entry, 'cigli sahibinden')).toBe(true);
    expect(matches(entry, 'cigli ankara')).toBe(false);
  });
});

describe('what the record offers up to be searched', () => {
  const market = {
    place: 'İzmir / Menemen',
    dated: '2026-07-29',
    note: 'sahibinden satılık listesini 14. sayfadan sonra vermedi',
    reading: 'Ulukent üçlüsü içinde en pahalısı 30 Ağustos',
    neighbourhoods: [{ name: '30 Ağustos', listing_count: 40, source: 'İlan, 3+1' }],
  };
  const rate = {
    bank: 'Türkiye Halk Bankası A.Ş.',
    captured_on: '2026-08-01',
    offers: [{ product: 'Yeni Evlilere Özel Konut Kredisi', monthly_rate: 2.6 }],
  };

  it('offers a district reading under its place and date', () => {
    const [entry] = searchable([market], []);

    expect(entry?.title).toBe('İzmir / Menemen');
    expect(entry?.dated).toBe('2026-07-29');
  });

  it('puts the note and the reading in the searchable text', () => {
    // These are the sentences worth finding again, and they are prose.
    const [entry] = searchable([market], []);

    expect(matches(entry!, 'sahibinden')).toBe(true);
    expect(matches(entry!, 'ulukent')).toBe(true);
  });

  it('puts the neighbourhood names in too', () => {
    expect(matches(searchable([market], [])[0]!, '30 agustos')).toBe(true);
  });

  it('offers a bank reading under its name and product', () => {
    const [entry] = searchable([], [rate]);

    expect(entry?.kind).toBe('rates');
    expect(matches(entry!, 'yeni evlilere')).toBe(true);
  });

  it('dates a bank reading by when it was read', () => {
    expect(searchable([], [rate])[0]?.dated).toBe('2026-08-01');
  });

  it('leaves same-day readings in the order they came, rather than an arbitrary one', () => {
    // Ties are the common case here, not the edge: an import run gives every
    // reading in a batch the same date. A comparator that answers -1 to both
    // (a, b) and (b, a) leaves their order unspecified.
    const sameDay = [
      { ...market, place: 'İzmir / Bir' },
      { ...market, place: 'İzmir / İki' },
      { ...market, place: 'İzmir / Üç' },
    ];

    expect(searchable(sameDay, []).map((entry) => entry.title)).toEqual([
      'İzmir / Bir',
      'İzmir / İki',
      'İzmir / Üç',
    ]);
  });

  it('puts the newest reading first, whichever kind it is', () => {
    // A hit with no date is a hit you cannot use, and an old one above a new
    // one is the same problem one step later.
    expect(searchable([market], [rate]).map((entry) => entry.dated)).toEqual([
      '2026-08-01',
      '2026-07-29',
    ]);
  });
});
