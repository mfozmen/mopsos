/**
 * The page, actually running.
 *
 * `render.test.ts` reads the generated HTML as text, so every behaviour the
 * page's own script carries — the age cap, the salary note, the calculator —
 * was unverified: a page whose script threw on line one passed all of it. The
 * parse test caught the syntax half of that after a duplicate `const` shipped a
 * dead page; this file runs the thing.
 *
 * The DOM is jsdom rather than happy-dom, and the page is loaded through the
 * constructor with `runScripts: 'dangerously'` so the compiled bundle and the
 * two inline scripts execute in document order exactly as the browser gets
 * them. That fidelity is the whole point: the bug being defended against is
 * "the script did not run", which a hand-assembled DOM would hide.
 *
 * What it does NOT cover: layout, focus rings, tooltip placement, and
 * scrolling. jsdom implements no layout, so `scrollIntoView` does not exist and
 * is stubbed below — nothing here asserts that the page scrolls, and a test
 * that claimed to would be asserting that a line was written.
 */
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import { formatTry, monthlyPayment, parseTurkishNumber } from '../finance/browser.js';
import { loadMortgageRules } from '../finance/rules.js';
import { renderPage, type PageData } from './render.js';

// Compiled the way `src/cli/ui.ts` compiles it, from the same entry point. A
// stub on `window.Mortgage` would let the arithmetic paths pass while the real
// page divides by zero.
const compiled = await build({
  entryPoints: ['src/finance/browser.ts'],
  bundle: true,
  format: 'iife',
  globalName: 'Mortgage',
  platform: 'browser',
  target: 'es2022',
  write: false,
  minify: true,
});

// A rate that is not the calculator's default, so pressing it has to change
// something for the test to pass.
const RATE = 3.15;

const DATA: PageData = {
  modules: [{ id: 'housing', label_tr: 'Konut' }],
  research: [],
  instruments: [],
  records: [],
  savings: [],
  rates: [
    {
      schema_version: 1,
      bank: 'Ziraat Bankası',
      kind: 'faiz',
      captured_on: '2026-07-27',
      source_url: 'https://example.test/konut',
      offers: [{ product: 'Konut Kredisi', monthly_rate: RATE }],
      earlier: [],
    },
  ],
  finance: { bundle: compiled.outputFiles[0]?.text ?? '', rules: loadMortgageRules() },
};

/** The page's defaults, as the form ships them. */
const DEFAULT = { downPayment: 1_000_000, months: 120, rate: 2.79 };

function open(data: PageData = DATA) {
  const dom = new JSDOM(renderPage(data), {
    runScripts: 'dangerously',
    url: 'https://mopsos.test/',
  });
  const { document } = dom.window;

  // jsdom has no layout and therefore no scrollIntoView. Stubbed so the rate
  // button's handler reaches its end; the scroll itself is not observable here
  // and is not asserted anywhere in this file.
  dom.window.Element.prototype.scrollIntoView = () => {};

  const need = (id: string): HTMLElement => {
    const element = document.getElementById(id);
    if (element === null) throw new Error(`the page has no #${id}`);
    return element;
  };

  const control = (id: string): HTMLInputElement | HTMLSelectElement =>
    need(id) as HTMLInputElement | HTMLSelectElement;

  const fire = (id: string, ...kinds: string[]): void => {
    for (const kind of kinds) {
      control(id).dispatchEvent(new dom.window.Event(kind, { bubbles: true }));
    }
  };

  return {
    window: dom.window,
    text: (id: string): string => need(id).textContent ?? '',
    value: (id: string): string => control(id).value,
    /** The displayed figure as a number, so a comparison can be an inequality. */
    amount: (id: string): number => parseTurkishNumber(need(id).textContent ?? ''),
    type: (id: string, value: string): void => {
      control(id).value = value;
      fire(id, 'input');
    },
    // A browser fires input and then change for a select, and the page listens
    // for both. Sending only one would test a sequence no reader produces.
    choose: (id: string, value: string): void => {
      control(id).value = value;
      fire(id, 'input', 'change');
    },
    click: (selector: string): void => {
      const element = document.querySelector<HTMLElement>(selector);
      if (element === null) throw new Error(`the page has no ${selector}`);
      element.click();
    },
    /** Text of a region, for asking what the reader can see rather than one field. */
    region: (selector: string): string => document.querySelector(selector)?.textContent ?? '',
    disabled: (selector: string): boolean =>
      document.querySelector<HTMLButtonElement>(selector)?.disabled ?? false,
  };
}

describe('the calculator in the page', () => {
  it('recomputes the instalment when a field changes', () => {
    const page = open();
    const before = page.text('payment');

    // 2.000.000 at the 70% ratio leaves the loan under the cap, so the whole
    // 1.000.000 gap is borrowed and the instalment is the plain annuity.
    page.type('price', '2.000.000');

    expect(page.text('payment')).not.toBe(before);
    expect(page.text('payment')).toBe(
      formatTry(monthlyPayment(2_000_000 - DEFAULT.downPayment, DEFAULT.rate, DEFAULT.months)),
    );
  });

  it('recomputes what the budget reaches when the budget changes', () => {
    const page = open();
    const before = page.amount('maxPrice');

    page.type('budget', '30.000');

    expect(page.amount('maxPrice')).toBeLessThan(before);
  });

  it('says what is wrong instead of printing NaN', () => {
    const page = open();

    page.type('budget', 'iki bin');

    expect(page.text('paymentNote')).toBe('Sayıları kontrol et.');
    expect(page.region('.answers')).not.toContain('NaN');
    expect(page.text('maxPrice')).toBe('—');
  });
});

describe('the age cap on the term', () => {
  it('refuses a 120-month term at 62 and says how long is left', () => {
    const page = open();

    page.type('age', '62');

    // 70 − 62 = 8 years of instalments. Refused rather than silently shortened:
    // the shorter term is what raises the instalment.
    expect(page.text('paymentNote')).toContain('96');
    expect(page.text('payment')).toBe('—');
    expect(page.text('maxPrice')).toBe('—');
  });

  it('computes the same loan at 96 months and marks the cap beside the field', () => {
    const page = open();

    page.type('age', '62');
    page.type('months', '96');

    expect(page.text('payment')).toBe(formatTry(monthlyPayment(2_450_000, DEFAULT.rate, 96)));
    expect(page.text('termCap')).toContain('96');
  });
});

describe('an existing home in the household', () => {
  it('cuts what the same budget reaches, and says why', () => {
    const page = open();
    const before = page.amount('maxPrice');

    page.choose('ownsHome', 'yes');

    // The ratio drops to a quarter (BDDK 10656), so the deposit has to cover
    // four times as much of the price.
    expect(page.amount('maxPrice')).toBeLessThan(before);
    expect(page.text('breakdown')).toContain('dörtte bire indi');
  });
});

describe('the salary question', () => {
  it('shows the public-sector note when the answer changes, and clears it again', () => {
    const page = open();

    expect(page.text('salaryNote')).toBe('');

    page.choose('salary', 'public');
    expect(page.text('salaryNote')).toContain('protokol');

    page.choose('salary', 'private');
    expect(page.text('salaryNote')).toBe('');
  });
});

describe('pressing a rate in the table', () => {
  it('puts it in the calculator and recomputes with it', () => {
    // Not the scroll — jsdom has no layout. What is observable is that the
    // number moved into the field and the answer followed it.
    const page = open();
    const before = page.text('payment');

    page.click('.use-rate');

    expect(page.value('rate')).toBe('3,15');
    expect(page.text('payment')).not.toBe(before);
    expect(page.text('payment')).toBe(formatTry(monthlyPayment(2_450_000, RATE, DEFAULT.months)));
  });
});

describe('sending the agent out', () => {
  it('disables the button and keeps it disabled while the run continues', async () => {
    const page = open();
    page.window.fetch = (() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({}) })) as unknown as typeof fetch;

    page.click('#ask-rates');

    expect(page.disabled('#ask-rates')).toBe(true);
    // The rates box's own line, on the panel the button lives on. The market
    // form's line is on the other panel and saying it there says it to nobody.
    expect(page.text('ask-rates-status')).toContain('isteniyor');

    await new Promise((resolve) => setTimeout(resolve, 0));

    // Still disabled after the POST returns: the agent run has barely started,
    // and a button that looks idle gets pressed again.
    expect(page.text('ask-rates-status')).toContain('sıraya alındı');
    expect(page.disabled('#ask-rates')).toBe(true);
  });

  // A fresh page per press: the button stays disabled after a successful
  // request, on purpose, so one page cannot send two.
  const asked = (bank?: string): unknown => {
    const page = open();
    const sent: unknown[] = [];
    page.window.fetch = ((_url: string, init: { body: string }) => {
      sent.push(JSON.parse(init.body));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }) as unknown as typeof fetch;

    if (bank !== undefined) page.type('bank', bank);
    page.click('#ask-rates');

    return sent[0];
  };

  it('sends a savings request with the firm that was typed', () => {
    const page = open();
    const sent: unknown[] = [];
    page.window.fetch = ((_url: string, init: { body: string }) => {
      sent.push(JSON.parse(init.body));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }) as unknown as typeof fetch;

    page.type('provider', 'Birevim');
    page.click('#ask-savings');

    expect(sent[0]).toEqual({ kind: 'savings', provider: 'Birevim' });
    expect(page.text('ask-savings-status')).toContain('isteniyor');
  });

  it('sends the bank that was typed', () => {
    expect(asked('Akbank')).toEqual({ kind: 'rates', bank: 'Akbank' });
  });

  it('sends no bank when the field was left alone, which is every bank', () => {
    expect(asked()).toEqual({ kind: 'rates', bank: '' });
  });

  it('answers the market request on the market panel', async () => {
    const page = open();
    page.window.fetch = (() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({}) })) as unknown as typeof fetch;

    page.click('#ask-market');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(page.text('ask-status')).toContain('sıraya alındı');
    expect(page.text('ask-rates-status')).not.toContain('sıraya alındı');
  });
});

describe('how long ago a reading was', () => {
  const isoDaysAgo = (days: number): string => {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-');
  };

  const withDates = (research: string, rate: string): PageData => ({
    ...DATA,
    research: [{ place: 'Menemen', dated: research, neighbourhoods: [] }],
    rates: [{ ...DATA.rates[0]!, captured_on: rate }],
  });

  const line = (research: string, rate: string): string =>
    open(withDates(research, rate)).region('.freshness');

  it('counts days at the moment the page is read, not when it was built', () => {
    expect(line(isoDaysAgo(0), isoDaysAgo(5))).toContain('5 gün önce');
  });

  it('says bugün rather than 0 gün önce', () => {
    expect(line(isoDaysAgo(0), isoDaysAgo(5))).toContain('bugün');
  });

  it('says dün rather than 1 gün önce', () => {
    expect(line(isoDaysAgo(1), isoDaysAgo(5))).toContain('dün');
  });

  it('leaves a date in the future alone rather than counting backwards', () => {
    // A clock set wrong on the reading machine should not make the page say
    // "-1 gün önce", which reads as a bug in the record rather than in the clock.
    expect(line(isoDaysAgo(-1), isoDaysAgo(5))).not.toContain('-1');
  });

  it('keeps the date itself, so the line still means something without the age', () => {
    expect(line(isoDaysAgo(0), isoDaysAgo(5))).toMatch(/\d{2}\.\d{2}\.\d{4}/);
  });
});

describe('sorting a table that has readings folded under its rows', () => {
  const bank = (name: string, monthly_rate: number, earlier: unknown[] = []): unknown => ({
    ...DATA.rates[0]!,
    bank: name,
    offers: [{ product: 'Konut Kredisi', monthly_rate }],
    earlier,
  });

  const history = {
    corrected: false,
    report: { ...DATA.rates[0]!, captured_on: '2026-07-20', earlier: undefined },
  };

  const page = (): ReturnType<typeof open> =>
    open({
      ...DATA,
      // Both banks carry history. With only one, the naive sort happens to put
      // the orphaned row last anyway -- its cells are empty, and empty sorts
      // last -- so the test would pass against the bug it exists to catch.
      rates: [
        bank('Aaa Bank', 3.5, [history]),
        bank('Zzz Bank', 2.5, [history]),
      ] as PageData['rates'],
    });

  /** Every row of the rates table, as "bank name" or "history" in document order. */
  const order = (dom: ReturnType<typeof open>): string[] =>
    [...dom.window.document.querySelectorAll<HTMLTableRowElement>('table.rates tbody tr')].map(
      (row) =>
        row.classList.contains('history') ? 'history' : (row.cells[0]?.textContent ?? '').trim(),
    );

  it('keeps the readings of a bank underneath it when the order changes', () => {
    // The rows are sorted independently, so a history row left behind would end
    // up folded under whichever bank happened to land above it — attributing
    // one bank's past to another.
    const dom = page();
    expect(order(dom)).toEqual(['Aaa Bank', 'history', 'Zzz Bank', 'history']);

    // Sorted on the rate rather than the name: ascending by name would leave
    // the rows where they already are, and a test that cannot tell proves
    // nothing.
    dom.click('table.rates thead th:nth-child(2)');

    expect(order(dom)).toEqual(['Zzz Bank', 'history', 'Aaa Bank', 'history']);
  });
});

describe('an offer the reader cannot take', () => {
  const gated = {
    ...DATA.rates[0]!,
    bank: 'Halkbank',
    offers: [
      {
        product: 'Yeni Evlilere Özel Konut Kredisi',
        monthly_rate: 2.6,
        conditions: 'resmi nikâh tarihi üzerinden 3 yıldan fazla geçmemiş olması',
      },
    ],
  };

  const open2 = (): ReturnType<typeof open> => open({ ...DATA, rates: [gated, DATA.rates[0]!] });

  const dimmed = (dom: ReturnType<typeof open>): boolean =>
    dom.window.document.querySelector('tr[data-gate]')?.classList.contains('shut') ?? false;

  it('dims it while the reader says the condition is not theirs', () => {
    // Not hidden: a rate that exists and is out of reach is worth knowing
    // about, and hiding it would make the record look smaller than it is.
    expect(dimmed(open2())).toBe(true);
  });

  it('brings it back the moment they say it is', () => {
    const dom = open2();
    dom.choose('newlywed', 'yes');

    expect(dimmed(dom)).toBe(false);
  });

  it('leaves an offer with no condition alone either way', () => {
    const dom = open2();
    const ordinary = dom.window.document.querySelectorAll('table.rates tbody tr')[1];

    expect(ordinary?.classList.contains('shut')).toBe(false);
  });
});

describe('comparing neighbourhoods', () => {
  const hood = (name: string, district: string, sale: number, count: number) => ({
    name,
    sale_per_m2: sale,
    rent_per_m2: 280,
    listing_count: count,
    source: 'İlan, 3+1',
  });

  const withPlaces = (): ReturnType<typeof open> =>
    open({
      ...DATA,
      research: [
        {
          place: 'İzmir / Menemen',
          dated: '2026-07-29',
          neighbourhoods: [hood('30 Ağustos', 'Menemen', 52_857, 40)],
        },
        {
          place: 'İzmir / Çiğli',
          dated: '2026-07-29',
          neighbourhoods: [hood('Küçük Çiğli', 'Çiğli', 48_000, 3)],
        },
      ],
    });

  it('narrows the district list to the province that is chosen', () => {
    const dom = withPlaces();
    const districts = dom.window.document.querySelectorAll('#compare-district option');

    expect([...districts].map((o) => o.textContent)).toEqual(['Menemen', 'Çiğli']);
  });

  it('narrows the neighbourhood list to the district that is chosen', () => {
    const dom = withPlaces();
    dom.choose('compare-district', 'Çiğli');
    const hoods = dom.window.document.querySelectorAll('#compare-neighbourhood option');

    expect([...hoods].map((o) => o.textContent)).toEqual(['Küçük Çiğli']);
  });

  it('puts two places from different districts on one comparison', () => {
    // Two scrolls and a memory, until now.
    const dom = withPlaces();
    dom.click('#compare-add');
    dom.choose('compare-district', 'Çiğli');
    dom.click('#compare-add');

    const out = dom.region('#compare-out');
    expect(out).toContain('30 Ağustos');
    expect(out).toContain('Küçük Çiğli');
  });

  it('shows the listing count beside every bar', () => {
    // At chart scale a 3-listing median and a 40-listing median look identical.
    const dom = withPlaces();
    dom.click('#compare-add');
    dom.choose('compare-district', 'Çiğli');
    dom.click('#compare-add');

    expect(dom.region('#compare-out')).toMatch(/3 ilan/);
    expect(dom.region('#compare-out')).toMatch(/40 ilan/);
  });

  it('warns that two bands differ without reprinting them', () => {
    // A source line in this record runs to three hundred characters of method.
    // Pasted into the warning, three of them bury the bars they are about.
    const long = 'emlakjet, ' + 'ilan havuzu okunup mahalleye göre ayrıldı, bant sabit. '.repeat(6);
    const dom = open({
      ...DATA,
      research: [
        {
          place: 'İzmir / Menemen',
          dated: '2026-07-29',
          neighbourhoods: [
            { ...hood('A', 'Menemen', 50_000, 20), source: long + '3+1' },
            { ...hood('B', 'Menemen', 40_000, 20), source: long + '2+1' },
          ],
        },
      ],
    });
    dom.click('#compare-add');
    dom.choose('compare-neighbourhood', 'B');
    dom.click('#compare-add');

    const warning = dom.region('#compare-out .caution');
    expect(warning).toMatch(/bant/i);
    expect(warning.length).toBeLessThan(200);
  });

  it('tells two namesakes in different provinces apart when one is dropped', () => {
    // "Merkez" is the central district of most Turkish provinces, and
    // "Cumhuriyet" is a neighbourhood in most of those. Keyed on anything less
    // than the full place, one × removes a bar from another city.
    const dom = open({
      ...DATA,
      research: [
        {
          place: 'İzmir / Merkez',
          dated: '2026-07-29',
          neighbourhoods: [hood('Cumhuriyet', 'Merkez', 50_000, 20)],
        },
        {
          place: 'Ankara / Merkez',
          dated: '2026-07-29',
          neighbourhoods: [hood('Cumhuriyet', 'Merkez', 40_000, 20)],
        },
      ],
    });
    dom.click('#compare-add');
    dom.choose('compare-province', 'Ankara');
    dom.click('#compare-add');
    expect(dom.window.document.querySelectorAll('#compare-out .bar-row')).toHaveLength(2);

    dom.click('#compare-out .bar-drop');

    expect(dom.window.document.querySelectorAll('#compare-out .bar-row')).toHaveLength(1);
  });

  it('says when the readings being compared are from different days', () => {
    // Districts are researched independently, not on a shared cadence. Two
    // readings weeks apart shown side by side present themselves as one moment.
    const dom = open({
      ...DATA,
      research: [
        {
          place: 'İzmir / Menemen',
          dated: '2026-07-29',
          neighbourhoods: [hood('A', 'Menemen', 50_000, 20)],
        },
        {
          place: 'İzmir / Çiğli',
          dated: '2026-06-15',
          neighbourhoods: [hood('B', 'Çiğli', 40_000, 20)],
        },
      ],
    });
    dom.click('#compare-add');
    dom.choose('compare-district', 'Çiğli');
    dom.click('#compare-add');

    expect(dom.region('#compare-out')).toContain('15.06.2026');
    expect(dom.region('#compare-out .caution')).toMatch(/farklı (tarih|gün)/i);
  });

  it('names the place each remove button removes', () => {
    // Every bar carries the same × and nothing else. Unlabelled, a screen
    // reader gets a row of identical buttons and no way to tell them apart.
    const dom = withPlaces();
    dom.click('#compare-add');

    const drop = dom.window.document.querySelector('#compare-out .bar-drop');
    expect(drop?.getAttribute('aria-label')).toContain('30 Ağustos');
  });

  it('does not let a place name close the data block it sits in', () => {
    // `</script>` is the one sequence that can end a script element early.
    // Unescaped, a place or a note containing it would close the block and put
    // the rest of the record into the document as markup.
    const dom = open({
      ...DATA,
      research: [
        {
          place: 'İzmir / Menemen',
          dated: '2026-07-29',
          neighbourhoods: [
            hood('Bir Yer</script><img src=x>', 'Menemen', 50_000, 20),
            hood('Öteki Yer', 'Menemen', 40_000, 20),
          ],
        },
      ],
    });

    expect(dom.window.document.querySelectorAll('img')).toHaveLength(0);
    expect(dom.window.document.querySelectorAll('#compare-neighbourhood option')).toHaveLength(2);
  });

  it('does not let a place name become markup', () => {
    // The names come from the record, and the record is written by agents
    // reading listing sites. A name is a name, whatever it contains.
    const dom = open({
      ...DATA,
      research: [
        {
          place: 'İzmir / Menemen',
          dated: '2026-07-29',
          neighbourhoods: [
            hood('<img src=x onerror=alert(1)>', 'Menemen', 50_000, 20),
            hood('Öteki Yer', 'Menemen', 40_000, 20),
          ],
        },
      ],
    });
    dom.click('#compare-add');

    const out = dom.window.document.querySelector('#compare-out');
    expect(out?.querySelectorAll('img')).toHaveLength(0);
    expect(out?.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('adds a place once, however many times it is chosen', () => {
    const dom = withPlaces();
    dom.click('#compare-add');
    dom.click('#compare-add');

    expect(dom.window.document.querySelectorAll('#compare-out .bar-row')).toHaveLength(1);
  });
});

describe('finding a reading again', () => {
  const dom = (): ReturnType<typeof open> =>
    open({
      ...DATA,
      research: [
        {
          place: 'İzmir / Çiğli',
          dated: '2026-07-29',
          note: 'sahibinden satılık listesini 14. sayfadan sonra vermedi',
          neighbourhoods: [
            { name: 'Küçük Çiğli', sale_per_m2: 48_000, listing_count: 22, source: 'İlan, 3+1' },
          ],
        },
      ],
    });

  // One shape, three reasons to keep it working: the Turkish letters a keyboard
  // skips, a word from the note rather than from the place, and the date without
  // which a hit cannot be used at all.
  it.each([
    ['a place typed without its Turkish letters', 'cigli', 'İzmir / Çiğli'],
    ['a reading by a word from its note', 'sahibinden', 'İzmir / Çiğli'],
    ['the date of a hit', 'cigli', '29.07.2026'],
  ])('finds %s', (_reason, typed, shown) => {
    const page = dom();
    page.type('find', typed);

    expect(page.region('#found')).toContain(shown);
  });

  it('says so rather than showing an empty list when nothing matches', () => {
    const page = dom();
    page.type('find', 'ankara');

    expect(page.region('#found')).toMatch(/bulunamadı|yok/i);
  });

  it('shows nothing at all until something is typed', () => {
    expect(dom().region('#found')).toBe('');
  });
});
