import { Script } from 'node:vm';

import { describe, expect, it } from 'vitest';

import { loadMortgageRules } from '../finance/rules.js';
import { buildTabs, PAGE_SCRIPTS, renderPage, type PageData } from './render.js';

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
  // The real pinned rules: the instalment column applies them to real money, and
  // a stub bracket table would let this pass while the page shows nonsense.
  finance: { bundle: 'var Mortgage = {};', rules: loadMortgageRules() },
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
    expect(renderPage(EMPTY)).toContain('"conventional_max_months":120');
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

  it('asks who the borrower is before showing rates, not after', () => {
    // Age and existing ownership decide which of these rates the reader can
    // actually get. Asking underneath the table makes them read a comparison
    // that half applies to them.
    const housing = panel(renderPage({ ...EMPTY, rates: [ZIRAAT] }), 'housing');

    expect(housing.indexOf('id="age"')).toBeGreaterThan(-1);
    expect(housing.indexOf('id="age"')).toBeLessThan(housing.indexOf('class="rates"'));
  });

  it('asks about the household, not just the reader', () => {
    // Every bank defines first-home by the household: "kendisi, eşi veya 18 yaş
    // altı çocuğu". A question that says only "senin üzerine" gets answered
    // wrong by anyone whose spouse owns the flat.
    const housing = panel(renderPage(EMPTY), 'housing');
    const before = housing.slice(0, housing.indexOf('id="ownsHome"'));
    const label = before.slice(before.lastIndexOf('<label>'));

    expect(label).toContain('eşin');
  });

  it('asks about existing ownership once, not twice', () => {
    const housing = panel(renderPage(EMPTY), 'housing');

    expect(housing.split('id="ownsHome"')).toHaveLength(2);
  });

  it('does not call the age limit a legal one', () => {
    // The pinned rules say in as many words that there is no statutory age or
    // maturity limit for a housing loan. Calling it legal on screen would put a
    // false statement of law in front of the reader.
    const housing = panel(renderPage(EMPTY), 'housing');
    const hint = housing.slice(
      housing.indexOf('id="age"') - 400,
      housing.indexOf('id="age"') + 400,
    );

    expect(hint).toContain('bankaların');
    expect(hint).not.toContain('yasal');
  });

  it('puts explanations behind a focusable control, not a hover-only title', () => {
    // A tooltip that only appears on hover is unreachable by keyboard and
    // invisible on a phone — which is where a question mark gets tapped.
    const housing = panel(renderPage(EMPTY), 'housing');

    expect(housing).toContain('class="hint"');
    expect(housing).toMatch(/<button[^>]+class="hint"/);
  });

  it('asks whose salary the household lives on', () => {
    const housing = panel(renderPage(EMPTY), 'housing');

    expect(housing).toContain('id="salary"');
    expect(housing.indexOf('id="salary"')).toBeLessThan(housing.indexOf('id="finance"'));
  });

  it('says the public-sector rate exists but is never published', () => {
    // Ziraat and Halkbank both say in their own documents that a salary
    // protocol changes the rate, and neither prints a number: Ziraat's own rate
    // feed carries a salary-present field that returns zero for housing. The
    // honest answer is not a filter — nothing in the record to filter — but an
    // instruction to go and ask, which is the only way to find out.
    const housing = panel(renderPage(EMPTY), 'housing');
    const question = housing.slice(
      housing.indexOf('id="salary"') - 1200,
      housing.indexOf('id="salary"'),
    );

    expect(question).toContain('protokol');
    expect(question).toContain('şube');
  });

  it('leads with the product, not with four hundred words of conditions', () => {
    // The conditions run to fifteen lines for some banks and were swallowing the
    // table whole, which defeats the one question it exists to answer.
    const wordy = {
      ...ZIRAAT,
      offers: [
        {
          product: 'Yeni Evlilere Özel',
          monthly_rate: 2.6,
          conditions: 'Paket oranı. '.repeat(60),
        },
      ],
    };
    const row = panel(renderPage({ ...EMPTY, rates: [wordy] }), 'housing');
    const cell = row.slice(
      row.indexOf('<td class="terms"'),
      row.indexOf('</td>', row.indexOf('<td class="terms"')),
    );

    expect(cell).toContain('Yeni Evlilere Özel');
    expect(cell.indexOf('Yeni Evlilere Özel')).toBeLessThan(cell.indexOf('Paket oranı.'));
  });

  it('keeps the conditions on the page, one click away', () => {
    // Hidden, not dropped. A package rate that requires four insurance products
    // is a different offer, and the difference is the whole comparison — it just
    // does not belong in front of the number it qualifies.
    const housing = panel(renderPage({ ...EMPTY, rates: [ZIRAAT] }), 'housing');

    expect(housing).toContain('<details');
    expect(housing).toContain(ZIRAAT.offers[0]?.conditions ?? 'NO CONDITIONS IN FIXTURE');
  });

  it('says nothing about conditions when the bank published none', () => {
    // An empty disclosure triangle invites a click that reveals nothing.
    const bare = { ...ZIRAAT, offers: [{ product: 'Konut Kredisi', monthly_rate: 2.79 }] };
    const housing = panel(renderPage({ ...EMPTY, rates: [bare] }), 'housing');

    expect(housing).not.toContain('<details');
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

describe('market research', () => {
  const report = (neighbourhood: Record<string, unknown>) => ({
    place: 'İzmir / Çiğli',
    dated: '2026-07-28',
    neighbourhoods: [
      {
        name: 'Egekent 2',
        listing_count: 62,
        basis: 'listing_median' as const,
        confidence: 'medium' as const,
        source: 'İlan araması, 3+1',
        ...neighbourhood,
      },
    ],
  });

  it('shows a dash where a figure was not found, never NaN', () => {
    // "Nothing usable was found here" is a finding. Printing NaN turns it into
    // a bug report, and printing 0 turns it into a lie.
    const housing = panel(
      renderPage({ ...EMPTY, research: [report({ rent_per_m2: 180 })] }),
      'housing',
    );

    expect(housing).toContain('Egekent 2');
    expect(housing).not.toContain('NaN');
  });

  it('shows what the scout could not find, not just what it could', () => {
    // The brief asks for it in as many words — a blocked site, four listings, a
    // mix that would not hold still. Validating it and storing it while never
    // showing it is the same as not asking for it.
    const housing = panel(
      renderPage({
        ...EMPTY,
        research: [
          {
            ...report({ note: 'Sadece 4 ilan; medyan güvenilir değil.' }),
            note: 'Sahibinden bu ilçede robots.txt ile kapalı, hepsiemlak kullanıldı.',
          },
        ],
      }),
      'housing',
    );

    expect(housing).toContain('Sadece 4 ilan');
    expect(housing).toContain('robots.txt ile kapalı');
  });

  it("shows the scout's reading, marked as opinion rather than measurement", () => {
    // A table of numbers with no reading makes the reader do the interpreting
    // twice — once to find the pattern, once to doubt it. But it is opinion,
    // and it has to look like opinion beside figures that are not.
    const housing = panel(
      renderPage({
        ...EMPTY,
        research: [
          {
            ...report({ sale_per_m2: 42_590, rent_per_m2: 309 }),
            reading:
              'Gazi Mustafa Kemal hem en yüksek getiriyi hem en düşük taksit/kira oranını veriyor.',
          },
        ],
      }),
      'housing',
    );

    expect(housing).toContain('Gazi Mustafa Kemal hem en yüksek');
    expect(housing).toMatch(/class="reading"/);
  });

  it('shows what owning costs against renting, per neighbourhood', () => {
    // The buyer's question, and the reason the brief tells a scout not to
    // compute it: it needs the rate record, which the report does not have.
    const housing = panel(
      renderPage({
        ...EMPTY,
        // With an example, so a real cost can be computed. Without one the
        // column is absent on purpose — the next test holds that.
        rates: [
          {
            ...ZIRAAT,
            offers: [
              {
                product: 'Konut Kredisi',
                monthly_rate: 2.6,
                example: { amount: 1_000_000, months: 120, instalment: 27_252.33, fees: 36_802 },
              },
            ],
          },
        ],
        research: [report({ sale_per_m2: 42_590, rent_per_m2: 309 })],
      }),
      'housing',
    );

    expect(housing).toContain('Taksit/Kira');
    expect(housing).toMatch(/\d,\d{2}×/);
  });

  it('says which rate and which flat the instalment column assumes', () => {
    // Three assumptions sit behind that one number — a 100 m² flat, 120 months,
    // and one particular bank's real rate. A ratio whose assumptions are not
    // stated is a number the reader cannot argue with.
    const housing = panel(
      renderPage({
        ...EMPTY,
        rates: [
          {
            ...ZIRAAT,
            offers: [
              {
                product: 'Konut Kredisi',
                monthly_rate: 2.6,
                example: { amount: 1_000_000, months: 120, instalment: 27_252.33, fees: 36_802 },
              },
            ],
          },
        ],
        research: [report({ sale_per_m2: 42_590, rent_per_m2: 309 })],
      }),
      'housing',
    );

    expect(housing).toContain('100 m²');
    expect(housing).toContain('120 ay');
    expect(housing).toContain('Ziraat Bankası');
  });

  it('says nothing about instalments when no bank rate can be computed', () => {
    // Every rate in the record can be unknown — most were, until recently. An
    // instalment column resting on a guessed rate would be worse than absent.
    const housing = panel(
      renderPage({ ...EMPTY, research: [report({ sale_per_m2: 42_590, rent_per_m2: 309 })] }),
      'housing',
    );

    expect(housing).not.toContain('Taksit/Kira');
  });

  it('says when a report carries no reading, rather than leaving a silence', () => {
    // The field is optional so that reports written before it existed stay
    // loadable. That makes its absence invisible unless the page says so, and
    // an unread table looks exactly like a table nobody had anything to say
    // about.
    const housing = panel(
      renderPage({ ...EMPTY, research: [report({ sale_per_m2: 42_590 })] }),
      'housing',
    );

    expect(housing).toContain('Bu raporda okuma yok');
  });

  it('explains what the confidence words mean, where they are shown', () => {
    // "orta güven" beside a number is a label until someone says what it takes
    // to earn it. The reader has no way to guess that high means a second
    // source rather than a bigger sample.
    const housing = panel(
      renderPage({ ...EMPTY, research: [report({ sale_per_m2: 48_000 })] }),
      'housing',
    );
    const header = housing.slice(housing.indexOf('İlan'), housing.indexOf('İlan') + 900);

    expect(header).toContain('class="hint"');
    expect(header).toContain('ikinci bir kaynak');
  });

  it('says how much the scout trusts a figure', () => {
    // The brief spends a table on high/medium/low and the schema requires it.
    // A figure whose reliability is recorded and then not shown is presented as
    // though it were certain, which is the opposite of what recording it meant.
    const housing = panel(
      renderPage({
        ...EMPTY,
        research: [report({ sale_per_m2: 48_000, confidence: 'low' as const })],
      }),
      'housing',
    );
    const row = housing.slice(
      housing.indexOf('Egekent 2'),
      housing.indexOf('</tr>', housing.indexOf('Egekent 2')),
    );

    expect(row).toContain('düşük');
  });

  it('says how many listings a figure rests on', () => {
    // A median over three listings is noise wearing a number's clothes. The
    // count is what tells them apart, so it travels with the figure.
    const housing = panel(
      renderPage({
        ...EMPTY,
        research: [report({ sale_per_m2: 48_000, rent_per_m2: 180, gross_yield: 0.045 })],
      }),
      'housing',
    );

    expect(housing).toContain('62');
  });
});

describe('the housing layout', () => {
  const housing = () => panel(renderPage({ ...EMPTY, rates: [ZIRAAT] }), 'housing');

  it('keeps the reading order a narrow screen gets', () => {
    // research -> who you are -> the banks -> the calculator. The banks come
    // BEFORE the calculator on purpose: a rate is a button, and a reader who
    // meets the calculator first fills in the default and never finds out.
    //
    // Below the breakpoint there is no grid, so this order IS the phone's
    // order. It must survive any rearrangement made for wide screens.
    const page = housing();
    const at = (marker: string) => page.indexOf(marker);

    expect(at('class="research"')).toBeLessThan(at('id="household"'));
    expect(at('id="household"')).toBeLessThan(at('class="rates"'));
    expect(at('class="rates"')).toBeLessThan(at('id="finance"'));
  });

  it('puts the calculator beside the banks on a wide screen', () => {
    // Reading a rate used to mean scrolling past fifteen banks to use it.
    // Placement is by grid coordinates, so the DOM order above stays intact.
    const page = renderPage(EMPTY);

    expect(page).toMatch(/@media \(min-width:[^)]*\)/);
    expect(page).toMatch(/\.evidence\s*\{[^}]*grid-(row|area)/);
  });

  it('lets a wide table scroll inside itself rather than the page sideways', () => {
    // Five columns do not fit 405 pixels. Without this the whole page scrolls
    // horizontally on a phone, which moves the headings off-screen too.
    expect(housing()).toContain('<div class="scroller"');
    expect(renderPage(EMPTY)).toMatch(/\.scroller\s*\{[^}]*overflow-x:\s*auto/);
  });

  it('does not let a closed tooltip take up space', () => {
    // visibility:hidden still occupies layout, and a 328px tooltip anchored near
    // the right edge pushed the document wider than the screen while invisible.
    const page = renderPage(EMPTY);
    const body = page.slice(page.indexOf('.hint-body {'), page.indexOf('.hint-body {') + 400);

    expect(body).toContain('display: none');
    expect(body).not.toContain('visibility: hidden');
  });

  it('gives the research table the full width, not a column', () => {
    // Twenty-one neighbourhoods across six columns does not read in half a page.
    const page = housing();

    expect(page.indexOf('class="research"')).toBeLessThan(page.indexOf('class="split"'));
  });
});

describe('sortable tables', () => {
  const housing = () => panel(renderPage({ ...EMPTY, rates: [ZIRAAT] }), 'housing');

  it('makes every heading a control, not just decoration', () => {
    // Fifteen banks and twenty-six neighbourhoods. A sort order the reader
    // cannot change is an opinion baked into the page.
    // `<th` and not `<th`, or this matches `<thead>` and fails on markup that
    // is perfectly correct.
    const headings = [...housing().matchAll(/<th(?![a-z])[^>]*>/g)].map((m) => m[0]);

    expect(headings.length).toBeGreaterThan(3);
    for (const th of headings) expect(th).toContain('aria-sort');
  });

  it('says which way a column sorts, for a screen reader too', () => {
    // aria-sort is what makes the state audible. A caret drawn in CSS says it
    // to one kind of reader only.
    expect(housing()).toMatch(/aria-sort="(none|ascending|descending)"/);
  });

  it('starts in the order the data arrived, with nothing marked sorted', () => {
    // The default ranking is explained in the caveat under the rates table.
    // Marking a column as sorted on load would claim the reader chose it.
    expect(housing()).not.toMatch(/aria-sort="(ascending|descending)"/);
  });
});

describe('the page script', () => {
  /**
   * The other tests here read the rendered HTML as text, so a page whose script
   * does not even parse passes every one of them. That is not hypothetical: a
   * duplicate `const` shipped a page where nothing at all ran, and the suite
   * stayed green. Compiling it is the cheapest thing that would have caught it.
   */
  it('parses', () => {
    expect(PAGE_SCRIPTS.length).toBeGreaterThan(0);

    for (const script of PAGE_SCRIPTS) {
      // Compiled, not run: this asks whether the page parses, and running it
      // would need a DOM it has no business having here.
      expect(() => new Script(script)).not.toThrow();
    }
  });
});
