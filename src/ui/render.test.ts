import { describe, expect, it } from 'vitest';

import { buildTabs, renderPage, type PageData } from './render.js';

const MODULES = [
  { id: 'housing', label_tr: 'Konut' },
  { id: 'precious_metals', label_tr: 'Altın & Gümüş' },
  { id: 'fx', label_tr: 'Döviz' },
  { id: 'equities', label_tr: 'Hisse' },
  { id: 'funds', label_tr: 'Fonlar' },
];

const EMPTY: PageData = {
  modules: MODULES,
  research: [],
  instruments: [],
  records: [],
  rates: [],
  finance: { bundle: 'var Mortgage = {};', rules: { term: { max_months: 120 } } },
};

const ZIRAAT = {
  schema_version: 1 as const,
  bank: 'Ziraat Bankası',
  kind: 'faiz' as const,
  captured_on: '2026-07-27',
  source_url: 'https://example.test/konut',
  offers: [{ product: 'Konut Kredisi', monthly_rate: 2.79, conditions: 'Maaş müşterisi' }],
};

/**
 * One panel's markup. Bounded by the next panel or the footer rather than the
 * next `<section>`, because panels contain sections of their own.
 */
function panel(html: string, id: string): string {
  const start = html.indexOf(`id="panel-${id}"`);
  const next = html.indexOf('id="panel-', start + 1);
  const end = next === -1 ? html.indexOf('<footer', start) : next;
  return html.slice(start, end);
}

describe('the tabs', () => {
  it('shows every tab, named in Turkish and safely escaped', () => {
    const html = renderPage(EMPTY);

    for (const tab of buildTabs(MODULES)) {
      expect(html).toContain(tab.name.replaceAll('&', '&amp;'));
    }
  });

  it('lists investments and nothing else, in the order the registry gives them', () => {
    // Tabs are peers of one kind: places the money can go. Financing is not one
    // of those — it is part of buying a house, and it belongs inside that tab.
    expect(buildTabs(MODULES).map((tab) => tab.name)).toEqual([
      'Konut',
      'Altın & Gümüş',
      'Döviz',
      'Hisse',
      'Fonlar',
      'Sicil',
    ]);
  });

  it('has no separate financing tab', () => {
    expect(buildTabs(MODULES).map((tab) => tab.id)).not.toContain('finansman');
  });

  it('opens on the one being worked on first', () => {
    expect(buildTabs(MODULES)[0]?.id).toBe('housing');
  });

  it('names every tab after its module, so a link cannot drift from the data', () => {
    expect(
      buildTabs(MODULES)
        .slice(0, -1)
        .map((tab) => tab.id),
    ).toEqual(MODULES.map((module) => module.id));
  });

  it('ends with Sicil, which is a look back rather than a decision', () => {
    const tabs = buildTabs(MODULES);

    expect(tabs[tabs.length - 1]?.id).toBe('sicil');
  });

  it('picks up an instrument nobody has thought of yet', () => {
    const withCrypto = [
      ...MODULES,
      { id: 'crypto', label_tr: 'Kripto', kind: 'instrument' as const },
    ];

    expect(buildTabs(withCrypto).map((tab) => tab.id)).toContain('crypto');
  });

  it('marks exactly one tab selected', () => {
    const html = renderPage(EMPTY);
    // Anchored on the aria-label and searched forward from it: every role
    // appears in the stylesheet too, and the stylesheet comes first.
    const start = html.indexOf('aria-label="Bölümler"');
    const tablist = html.slice(start, html.indexOf('role="tabpanel"', start));

    expect(tablist.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(tablist.match(/aria-selected="false"/g)).toHaveLength(buildTabs(MODULES).length - 1);
  });

  it('hides every panel except the first, so one tab is one screen', () => {
    const html = renderPage(EMPTY);

    expect(panel(html, 'housing')).not.toContain('hidden');
    expect(panel(html, 'fx')).toContain('hidden');
  });

  it('wires each tab to the panel it controls', () => {
    const html = renderPage(EMPTY);

    for (const tab of buildTabs(MODULES)) {
      expect(html).toContain(`aria-controls="panel-${tab.id}"`);
      expect(html).toContain(`id="panel-${tab.id}"`);
    }
  });

  it('uses real tab semantics rather than links that scroll', () => {
    const html = renderPage(EMPTY);

    expect(html).toContain('role="tablist"');
    expect(html).toContain('role="tab"');
    expect(html).toContain('role="tabpanel"');
  });
});

describe('the finance calculator', () => {
  it('lives inside the housing tab, because financing is part of buying a house', () => {
    const konut = panel(renderPage(EMPTY), 'housing');

    for (const field of ['price', 'downPayment', 'rate', 'months', 'energyClass', 'budget']) {
      expect(konut).toContain(`id="${field}"`);
    }
  });

  it('is a section of that tab, under its own heading', () => {
    expect(panel(renderPage(EMPTY), 'housing')).toMatch(/Finansman/);
  });

  it('leaves the market research above it, since that comes first', () => {
    const konut = panel(renderPage(EMPTY), 'housing');

    expect(konut.indexOf('araştırma')).toBeLessThan(konut.indexOf('id="budget"'));
  });

  it('carries the arithmetic into the page rather than reimplementing it', () => {
    // One implementation of a payment formula. Two would disagree eventually,
    // and the disagreement would be silent.
    expect(renderPage(EMPTY)).toContain('var Mortgage = {};');
  });

  it('carries the pinned rules, so the browser applies the same limits', () => {
    expect(renderPage(EMPTY)).toContain('"max_months":120');
  });

  it('warns that the ratio applies to the appraised value, not the asking price', () => {
    // The ekspertiz value is routinely below the asking price in Turkey, so the
    // reachable price is lower than this calculation suggests. Saying so is the
    // difference between a tool and a toy.
    expect(panel(renderPage(EMPTY), 'housing')).toMatch(/ekspertiz/i);
  });

  it('says no tax is applied, because that is a real difference from a consumer loan', () => {
    expect(panel(renderPage(EMPTY), 'housing')).toMatch(/KKDF|BSMV/);
  });

  it('never sends the reader’s amounts anywhere', () => {
    // Amounts are personal data. The page does now talk to a local server to
    // queue research, so a blanket "no fetch" rule no longer holds — what holds
    // is that no field of the calculator appears in anything it sends.
    const html = renderPage(EMPTY);
    const sent = [...html.matchAll(/fetch\([^)]*\{[\s\S]*?\}\)/g)]
      .map((match) => match[0])
      .join('');

    for (const field of ['budget', 'downPayment', 'price', 'rate', 'months']) {
      expect(sent).not.toContain(field);
    }
  });

  it('stores nothing in the browser either', () => {
    expect(renderPage(EMPTY)).not.toMatch(/localStorage|sessionStorage|navigator\.sendBeacon/);
  });

  it('only ever talks to its own origin', () => {
    // A relative path cannot leave the machine. An absolute one could.
    const html = renderPage(EMPTY);

    for (const [, url] of html.matchAll(/fetch\(['"`]([^'"`]+)/g)) {
      expect(url?.startsWith('/')).toBe(true);
    }
  });
});

describe('sending the agent from the page', () => {
  it('offers to refresh the bank rates', () => {
    expect(panel(renderPage(EMPTY), 'housing')).toContain('id="ask-rates"');
  });

  it('asks for a place before researching a market', () => {
    const housing = panel(renderPage(EMPTY), 'housing');

    expect(housing).toContain('id="province"');
    expect(housing).toContain('id="district"');
    expect(housing).toContain('id="ask-market"');
  });

  it('says the request goes to the open Claude session, not into the void', () => {
    // A button that appears to do nothing is worse than no button. The reader
    // has to know where the work happens and that it needs the session open.
    expect(panel(renderPage(EMPTY), 'housing')).toMatch(/Claude/);
  });
});

describe('bank rates', () => {
  it('says nobody has looked yet, rather than showing an empty table', () => {
    expect(panel(renderPage(EMPTY), 'housing')).toMatch(/banka.*araştır/is);
  });

  it('links the bank to the page the figures were read from', () => {
    // The next question after "who is cheapest" is always "let me see it".
    expect(panel(renderPage({ ...EMPTY, rates: [ZIRAAT] }), 'housing')).toContain(
      'href="https://example.test/konut"',
    );
  });

  it('opens the bank in a new tab without handing it the referrer', () => {
    const housing = panel(renderPage({ ...EMPTY, rates: [ZIRAAT] }), 'housing');

    expect(housing).toContain('rel="noreferrer noopener"');
  });

  it('shows what a rate really costs beside what the bank calls it', () => {
    // %1,99 with a third of the loan taken as interest up front is a %3,10 loan.
    const akbank = {
      ...ZIRAAT,
      bank: 'Akbank',
      offers: [
        {
          product: 'Peşin faiz ödemeli',
          monthly_rate: 1.99,
          example: { amount: 1000000, months: 120, instalment: 21964, upfront_interest: 309637 },
        },
      ],
    };
    const housing = panel(renderPage({ ...EMPTY, rates: [akbank] }), 'housing');

    expect(housing).toContain('1,99');
    expect(housing).toContain('3,10');
  });

  it('says the real cost is unknown rather than repeating the quoted rate', () => {
    // Repeating it would present the number this column exists to correct as
    // though it were the correction.
    const housing = panel(renderPage({ ...EMPTY, rates: [ZIRAAT] }), 'housing');
    const trueCell = housing.slice(housing.indexOf('class="true-rate"'));

    expect(trueCell.slice(0, 60)).not.toContain('2,79');
  });

  it('shows a bank, its rate and what the rate depends on', () => {
    const housing = panel(renderPage({ ...EMPTY, rates: [ZIRAAT] }), 'housing');

    expect(housing).toContain('Ziraat Bankası');
    expect(housing).toContain('2,79');
    // A rate that requires moving your salary is not comparable with one that
    // does not, so the condition travels with the number.
    expect(housing).toContain('Maaş müşterisi');
  });

  it('says when the rate was read, since rates move weekly', () => {
    expect(panel(renderPage({ ...EMPTY, rates: [ZIRAAT] }), 'housing')).toContain('27.07.2026');
  });

  it('marks a participation bank as selling a profit share', () => {
    const katilim = { ...ZIRAAT, bank: 'Kuveyt Türk', kind: 'kar_payi' as const };

    expect(panel(renderPage({ ...EMPTY, rates: [katilim] }), 'housing')).toMatch(/kâr payı/i);
  });

  it('reports a bank that published nothing instead of dropping it', () => {
    // "Looked and found nothing" and "nobody looked" are different answers.
    const silent = { ...ZIRAAT, bank: 'Bir Banka', offers: [] };

    const housing = panel(renderPage({ ...EMPTY, rates: [silent] }), 'housing');
    expect(housing).toContain('Bir Banka');
    expect(housing).toMatch(/yayınlamıyor|yok/i);
  });

  it('says the order is by published rate, which is not the same as cheapest', () => {
    // The cheapest published figure in the record is a prepaid-interest product
    // that wants 309.637 TL up front. Sorting by headline rate is useful and
    // misleading at once, so the page says which of the two it is doing.
    const housing = panel(renderPage({ ...EMPTY, rates: [ZIRAAT] }), 'housing');

    expect(housing).toMatch(/en ucuz.*değil|değil.*en ucuz/is);
  });

  it('lets a rate be pushed into the calculator instead of retyped', () => {
    expect(panel(renderPage({ ...EMPTY, rates: [ZIRAAT] }), 'housing')).toContain(
      'data-rate="2.79"',
    );
  });
});

describe('instrument tabs', () => {
  it('says what each tab will hold rather than just "empty"', () => {
    // These are investments in their own right, not somewhere a deposit waits.
    // The copy said the latter, which was the wrong idea of the product.
    expect(panel(renderPage(EMPTY), 'precious_metals')).toMatch(/getiri/i);
  });

  it('does not describe an investment as a place to park a deposit', () => {
    expect(renderPage(EMPTY)).not.toMatch(/peşinat biriktirirken/i);
  });

  it('mentions certificates under funds, which is a route to a flat', () => {
    expect(panel(renderPage(EMPTY), 'funds')).toMatch(/sertifika/i);
  });
});

describe('empty states say what is missing, not just that something is', () => {
  it('tells you no research has been done rather than showing a blank page', () => {
    expect(panel(renderPage(EMPTY), 'housing')).toMatch(/araştırma/i);
  });

  it('never shows an unmeasured record as a score', () => {
    // Zero is the best possible Brier score. A seer that has never been measured
    // must not appear to have earned it.
    const sicil = panel(renderPage(EMPTY), 'sicil');

    expect(sicil).toMatch(/henüz/i);
    expect(sicil).not.toMatch(/0\.00/);
  });
});

describe('panels never go blank when they have data', () => {
  it('renders a seer record rather than nothing', () => {
    // The old renderer was removed and the branch was left returning an empty
    // string, so a panel with data in it drew nothing at all. Silent blankness
    // is the failure this project can least afford.
    const sicil = panel(
      renderPage({
        ...EMPTY,
        records: [{ seer: 'cautious', count: 6, brier: 0.19, predicted: 0.62, observed: 0.5 }],
      }),
      'sicil',
    );

    expect(sicil).toContain('cautious');
    expect(sicil).toContain('0,19');
    expect(sicil).not.toMatch(/Henüz/);
  });

  it('renders an instrument return rather than nothing', () => {
    const fx = panel(
      renderPage({
        ...EMPTY,
        instruments: [{ module: 'fx', name: 'USD/TRY', annual_return: 0.31, source: 'TCMB' }],
      }),
      'fx',
    );

    expect(fx).toContain('USD/TRY');
    expect(fx).toContain('TCMB');
    expect(fx).not.toMatch(/Henüz/);
  });
});

describe('research findings', () => {
  const data: PageData = {
    ...EMPTY,
    research: [
      {
        place: 'İzmir · Çiğli',
        dated: '2026-07-27',
        neighbourhoods: [
          {
            name: 'Egekent 2',
            sale_per_m2: 48500,
            rent_per_m2: 180,
            gross_yield: 0.045,
            listing_count: 142,
            source: 'Endeksa',
          },
        ],
      },
    ],
  };

  it('shows a neighbourhood with its figures', () => {
    const konut = panel(renderPage(data), 'housing');

    expect(konut).toContain('Egekent 2');
    expect(konut).toContain('48.500');
  });

  it('names the source of every figure', () => {
    // A number with no source cannot be checked later, and an unverifiable
    // number is worse than a missing one because it looks like knowledge.
    expect(panel(renderPage(data), 'housing')).toContain('Endeksa');
  });

  it('says when the research was done, since the market moves', () => {
    expect(panel(renderPage(data), 'housing')).toContain('27.07.2026');
  });
});

describe('safety', () => {
  it('escapes content instead of letting it become markup', () => {
    const data: PageData = {
      ...EMPTY,
      research: [{ place: '<script>alert(1)</script>', dated: '2026-07-27', neighbourhoods: [] }],
    };

    expect(renderPage(data)).not.toContain('<script>alert(1)</script>');
  });

  it('is a complete standalone document that loads nothing from the network', () => {
    const html = renderPage(EMPTY);

    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).not.toContain('http://');
    expect(html).not.toContain('https://');
  });
});
