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
  earlier: [],
};

/**
 * One panel's markup. Bounded by the next panel or the footer rather than the
 * next `<section>`, because panels contain sections of their own.
 */
function panel(html: string, id: string): string {
  // Bounded by the next TOP-LEVEL panel, marked with `class="tabpanel"`. The
  // housing panel now contains tab panels of its own, and matching any
  // `id="panel-` cut the slice off at the first of those.
  const start = html.indexOf(`id="panel-${id}"`);
  const next = html.indexOf('class="tabpanel"', start + 1);
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

    // The panel's own tag, not its contents: the housing panel now holds tab
    // panels of its own and one of those is hidden by design.
    const housing = panel(html, 'housing');
    expect(housing.slice(0, housing.indexOf('>'))).not.toContain('hidden');
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

  it('explains where the gap between the two columns comes from', () => {
    // The mechanism, which is true of every reading: interest taken up front
    // shrinks what you receive while the instalment stays put. Whether the
    // lowest headline is also the dearest offer is a fact about the current
    // record, so the page derives that sentence rather than asserting it.
    const housing = panel(renderPage({ ...EMPTY, rates: [ZIRAAT] }), 'housing');

    expect(housing).toMatch(/peşin alınan faiz.*taksit aynı kalır/is);
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

describe('the sentence about the headline being a trap', () => {
  const bank = (name: string, rate: number, upfront?: number) => ({
    ...ZIRAAT,
    bank: name,
    offers: [
      {
        product: 'Konut',
        monthly_rate: rate,
        example: {
          amount: 1_000_000,
          months: 120,
          instalment: rate === 1.99 ? 21_964.48 : 27_252.33,
          upfront_interest: upfront,
        },
      },
    ],
  });
  const claim = 'en pahalı teklif';

  it('is there while the record still says so', () => {
    const rates = [bank('Ucuz görünen', 1.99, 309_637), bank('Dürüst', 2.6)];
    expect(panel(renderPage({ ...EMPTY, rates }), 'housing')).toContain(claim);
  });

  it('goes away when a bank publishes an honest low rate', () => {
    const rates = [bank('Dürüst', 1.99), bank('Pahalı', 2.6, 309_637)];
    expect(panel(renderPage({ ...EMPTY, rates }), 'housing')).not.toContain(claim);
  });
});

describe('the row a bank gets', () => {
  it('does not seat a bank as measured and then print a dash for it', () => {
    // The dangerous shape: the headline-cheapest offer has no worked example,
    // so ranking on it and displaying it are different answers. The caveat says
    // dash rows sit at the bottom because their cost is unknown — a dash seated
    // among measured banks would make that sentence a lie.
    const bank = {
      ...ZIRAAT,
      offers: [
        { product: 'Kampanya', monthly_rate: 1.99 },
        {
          product: 'Standart',
          monthly_rate: 2.6,
          example: { amount: 1_000_000, months: 120, instalment: 27_252.33, fees: 36_802 },
        },
      ],
    };
    const housing = panel(renderPage({ ...EMPTY, rates: [bank] }), 'housing');

    expect(housing).toContain('Standart');
    expect(housing).not.toContain('Kampanya');
  });

  it('shows the offer that really costs least, not the one called least', () => {
    // The page had its own headline sort, so it could rank a bank by one offer
    // and print another. VakıfBank's cheapest real cost is a product whose
    // headline is not its lowest.
    const bank = {
      ...ZIRAAT,
      offers: [
        {
          product: 'Manşeti düşük',
          monthly_rate: 1.99,
          example: {
            amount: 1_000_000,
            months: 120,
            instalment: 21_964.48,
            upfront_interest: 309_637.03,
            fees: 41_750,
          },
        },
        {
          product: 'Gerçekte ucuz',
          monthly_rate: 2.6,
          example: { amount: 1_000_000, months: 120, instalment: 27_252.33, fees: 36_802 },
        },
      ],
    };
    const housing = panel(renderPage({ ...EMPTY, rates: [bank] }), 'housing');

    expect(housing).toContain('Gerçekte ucuz');
    expect(housing).not.toContain('Manşeti düşük');
  });
});

describe('what the table says its order means', () => {
  it('no longer claims to be ordered on the published rate', () => {
    // It was, and saying so was the honest thing while it was true. It ranks on
    // the real cost now, and a caveat describing the old order would be worse
    // than none — it would tell the reader to distrust exactly the number they
    // should be reading.
    const housing = panel(renderPage({ ...EMPTY, rates: [ZIRAAT] }), 'housing');

    expect(housing).not.toContain('Sıralama <strong>yayınlanan aylık orana göre</strong>');
    expect(housing).toContain('gerçek maliyete göre');
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

describe('several reports on one page', () => {
  const reading = (place: string, dated: string, salePerM2: number) => ({
    place,
    dated,
    neighbourhoods: [
      {
        name: 'Bir Mahalle',
        sale_per_m2: salePerM2,
        listing_count: 12,
        source: 'emlakjet, 3+1, 55–175 m², medyan',
      },
    ],
  });

  const two = [
    reading('İzmir / Menemen', '2026-07-29', 42_590),
    reading('İzmir / Çiğli', '2026-07-28', 49_231),
  ];

  it('folds every report but the newest, so the page is not a scroll', () => {
    // Three districts is sixty-odd rows of table before the reader reaches
    // anything they can act on. The newest reading is the one being read; the
    // rest are there to compare against, one click away.
    const housing = panel(renderPage({ ...EMPTY, research: two }), 'housing');
    const opens = [...housing.matchAll(/<details class="report"( open)?>/g)].map((m) => m[1]);

    expect(opens).toHaveLength(2);
    expect(opens.filter(Boolean)).toHaveLength(1);
  });

  it('opens the newest reading, not whichever sorts first', () => {
    // The loader orders by place name, not by date — so index 0 is the
    // alphabetically first district. Every reading in the record shares a date
    // today, which is exactly why this would have gone unnoticed.
    const older = reading('Aydın / Efeler', '2026-06-01', 30_000);
    const newer = reading('İzmir / Menemen', '2026-07-29', 42_590);
    const housing = panel(renderPage({ ...EMPTY, research: [older, newer] }), 'housing');
    // Bounded by that block's own summary. Slicing to the end of the panel
    // swallows the folded report too, and then the assertion passes on the
    // wrong report — which is how this test first passed against the bug.
    const from = housing.indexOf('<details class="report" open>');
    const open = housing.slice(from, housing.indexOf('</summary>', from));

    expect(open).toContain('İzmir / Menemen');
    expect(housing.indexOf('Aydın / Efeler')).toBeLessThan(housing.indexOf('İzmir / Menemen'));
  });

  it('says what is inside a folded report without opening it', () => {
    // A row of dates is a filing cabinet. The summary carries the place, when it
    // was read and how much is in it, so the fold is a decision rather than a
    // guess.
    const housing = panel(renderPage({ ...EMPTY, research: two }), 'housing');

    expect(housing).toContain('İzmir / Çiğli');
    expect(housing).toMatch(/28\.07\.2026/);
    expect(housing).toMatch(/1 mahalle/);
  });
});

describe('the housing tab splits in two', () => {
  const housing = () => panel(renderPage({ ...EMPTY, rates: [ZIRAAT] }), 'housing');

  it('separates what you are looking at from what you can afford', () => {
    // Two different sessions of thinking. Twenty-eight neighbourhoods and
    // fifteen banks on one screen is not a page, it is a scroll.
    const page = housing();

    expect(page).toContain('id="panel-pazar"');
    expect(page).toContain('id="panel-finansman"');
    expect(
      page.slice(page.indexOf('id="panel-pazar"'), page.indexOf('id="panel-finansman"')),
    ).toContain('class="research"');
  });

  it('keeps the calculator beside the banks, in the same half', () => {
    // The rate is a button that feeds the calculator. Putting them on separate
    // screens would undo the reason they were put side by side.
    const page = housing();
    const money = page.slice(page.indexOf('id="panel-finansman"'));

    expect(money).toContain('id="household"');
    expect(money).toContain('class="rates"');
    expect(money).toContain('id="finance"');
  });

  it('shows one half at a time', () => {
    const page = housing();
    const hidden = [...page.matchAll(/id="panel-(pazar|finansman)"[^>]*?( hidden)?>/g)].map((m) =>
      Boolean(m[2]),
    );

    expect(hidden).toHaveLength(2);
    expect(hidden.filter(Boolean)).toHaveLength(1);
  });

  it('gives the inner tabs their own strip, not the outer one', () => {
    // Two tablists on the page. Wiring every [role=tab] to one handler makes
    // choosing a district also switch investment.
    // Elements, not mentions — the stylesheet and the script name it too.
    expect(renderPage(EMPTY).match(/<div[^>]*role="tablist"/g)).toHaveLength(2);
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

describe('how stale the picture is', () => {
  const reading = (dated: string) => ({ place: 'Menemen', dated, neighbourhoods: [] });
  const rate = (captured_on: string) => ({ ...ZIRAAT, captured_on });

  it('says when the record was last looked at, and how long ago', () => {
    const page = renderPage({ ...EMPTY, research: [reading('2026-07-29')] });

    expect(page).toContain('29.07.2026');
    expect(page).toContain('data-since="2026-07-29"');
  });

  it('says how old the oldest reading on the page is, not only the newest', () => {
    // The first thing to know before trusting a number is whether anything here
    // is still current. A fresh rate beside a four-day-old market reading is a
    // picture with a stale half, and the newest date alone hides that.
    const page = renderPage({
      ...EMPTY,
      research: [reading('2026-07-29')],
      rates: [rate('2026-07-27')],
    });

    expect(page).toContain('data-since="2026-07-29"');
    expect(page).toContain('data-since="2026-07-27"');
  });

  it('counts every reading behind the page', () => {
    const page = renderPage({
      ...EMPTY,
      research: [reading('2026-07-29'), reading('2026-07-28')],
      rates: [rate('2026-07-27')],
    });

    expect(page).toMatch(/3\s*okuma/);
  });

  it('says nothing at all when there is nothing to be stale', () => {
    expect(renderPage(EMPTY)).not.toContain('class="freshness"');
  });

  it('does not repeat itself when every reading is from the same day', () => {
    const page = renderPage({ ...EMPTY, research: [reading('2026-07-29'), reading('2026-07-29')] });

    expect(page.match(/data-since="/g)).toHaveLength(1);
  });
});

const HALKBANK_OFFERS = [
  {
    product: 'Yeni Evlilere Özel',
    monthly_rate: 2.6,
    example: { amount: 1_000_000, months: 120, instalment: 27_252.33, fees: 36_802 },
  },
];

describe('the readings behind a bank', () => {
  // A prepaid-interest offer, so the two figures differ and the row has to
  // print both to mean anything: %1,99 asked, %3,32 actually paid.
  const earlier = (captured_on: string, monthly_rate: number, corrected = false) => ({
    corrected,
    report: {
      ...ZIRAAT,
      captured_on,
      offers: [
        {
          product: 'Konut Kredisi',
          monthly_rate,
          example: {
            amount: 1_000_000,
            months: 120,
            instalment: 21_964.48,
            upfront_interest: 309_637.03,
            fees: 41_750,
          },
        },
      ],
    },
  });
  const withHistory = (...history: ReturnType<typeof earlier>[]) => ({
    ...EMPTY,
    rates: [{ ...ZIRAAT, earlier: history }],
  });

  it('offers the earlier readings of a bank that has some', () => {
    const housing = panel(renderPage(withHistory(earlier('2026-07-20', 3.19))), 'housing');

    expect(housing).toContain('20.07.2026');
  });

  it('shows what the earlier reading really cost, so the two can be compared', () => {
    // The headline alone cannot answer "did it get dearer" — the whole record
    // exists because the two figures move independently.
    const housing = panel(renderPage(withHistory(earlier('2026-07-20', 1.99))), 'housing');

    expect(housing).toMatch(/20\.07\.2026[\s\S]{0,200}%1,99[\s\S]{0,200}%3,3/);
  });

  it('says a correction is a correction rather than showing it as a rate that moved', () => {
    const housing = panel(renderPage(withHistory(earlier('2026-07-20', 3.19, true))), 'housing');

    expect(housing).toMatch(/düzelt/i);
  });

  it('calls a correction a correction in the summary, not an earlier reading', () => {
    // "1 eski okuma" would say the rate was once something else. It was not —
    // the reading was wrong, and the rate never moved.
    const housing = panel(renderPage(withHistory(earlier('2026-07-20', 1.99, true))), 'housing');

    expect(housing).toContain('1 düzeltme');
    expect(housing).not.toContain('1 eski okuma');
  });

  it('keeps the reason behind a fold of its own, so a long note cannot flood the row', () => {
    // The record's correction notes run to two thousand characters — a scout's
    // whole working log. Inlined, one correction buries the table it belongs to.
    const replacementNote = 'Önceki okuma ücretleri eksik almıştı. '.repeat(40);
    const history = { ...earlier('2026-07-20', 1.99, true), replacementNote };
    const housing = panel(renderPage(withHistory(history)), 'housing');

    expect(housing).toContain(replacementNote.trim().slice(0, 30));
    expect(housing).toContain('<summary>yeni okumanın notu</summary>');
  });

  it('says which way an earlier reading has moved since', () => {
    // The two figures on their own leave the reader subtracting. What is being
    // asked is whether borrowing got cheaper here, and %3,32 then against
    // %2,72 now is six tenths of a point.
    const now = { ...ZIRAAT, offers: [...HALKBANK_OFFERS], earlier: [earlier('2026-07-20', 1.99)] };
    const housing = panel(renderPage({ ...EMPTY, rates: [now] }), 'housing');

    expect(housing).toMatch(/0,60 puan ucuz/);
  });

  it('says when the comparison changed product, since that is a different question', () => {
    // The bank's best then against its best now moves when a cheaper product
    // appears and nothing was repriced. Shown the same way as one product's
    // own change, it reads as a rate that fell.
    const gone = {
      corrected: false,
      report: {
        ...ZIRAAT,
        captured_on: '2026-07-20',
        offers: [
          {
            product: 'Çekilen Ürün',
            monthly_rate: 1.99,
            example: {
              amount: 1_000_000,
              months: 120,
              instalment: 21_964.48,
              upfront_interest: 309_637.03,
              fees: 41_750,
            },
          },
        ],
      },
    };
    const now = { ...ZIRAAT, offers: [...HALKBANK_OFFERS], earlier: [gone] };
    const housing = panel(renderPage({ ...EMPTY, rates: [now] }), 'housing');

    expect(housing).toContain('en ucuz ürün değişti');
  });

  it('says nothing moved rather than printing a zero', () => {
    const same = {
      corrected: false,
      report: { ...ZIRAAT, captured_on: '2026-07-20', offers: [...HALKBANK_OFFERS] },
    };
    const now = { ...ZIRAAT, offers: [...HALKBANK_OFFERS], earlier: [same] };
    const housing = panel(renderPage({ ...EMPTY, rates: [now] }), 'housing');

    expect(housing).toContain('değişmedi');
  });

  it('stays silent when the earlier reading could not be measured', () => {
    // A bank that gained a worked example between readings did not get dearer;
    // our knowledge changed. Rendered as a movement it is forty basis points of
    // fiction, larger than most real moves.
    const unmeasured = {
      corrected: false,
      report: {
        ...ZIRAAT,
        captured_on: '2026-07-20',
        offers: [{ product: 'Konut', monthly_rate: 2.6 }],
      },
    };
    const now = { ...ZIRAAT, offers: [...HALKBANK_OFFERS], earlier: [unmeasured] };
    const housing = panel(renderPage({ ...EMPTY, rates: [now] }), 'housing');

    // Not "değişmedi" either: that claims it held steady, and nobody knows.
    // The dash in the row already says the cost is unknown.
    expect(housing).not.toMatch(/puan (ucuz|pahalı)/);
    expect(housing).not.toContain('değişmedi');
  });

  it('adds nothing to a bank nobody has read twice', () => {
    const housing = panel(renderPage({ ...EMPTY, rates: [{ ...ZIRAAT, earlier: [] }] }), 'housing');

    expect(housing).not.toContain('class="history"');
  });

  it('counts them in the summary, so the history is visible while folded', () => {
    const housing = panel(
      renderPage(withHistory(earlier('2026-07-20', 3.19), earlier('2026-07-13', 3.4))),
      'housing',
    );

    expect(housing).toMatch(/2 eski okuma/);
  });
});

describe('the readings behind a district', () => {
  const hood = (sale: number) => ({
    name: 'Egekent 2',
    sale_per_m2: sale,
    rent_per_m2: 288,
    listing_count: 40,
    source: 'İlan sitesi',
  });
  const reading = (dated: string, sale: number, extra = {}) => ({
    place: 'İzmir / Menemen',
    dated,
    neighbourhoods: [hood(sale)],
    ...extra,
  });

  it('shows the figures an earlier reading of a district gave', () => {
    const page = renderPage({
      ...EMPTY,
      research: [reading('2026-07-29', 52_857, { earlier: [reading('2026-07-20', 48_000)] })],
    });

    expect(panel(page, 'housing')).toContain('48.000');
  });

  it('tells two readings of one day apart by the time they were taken', () => {
    // The record holds exactly this pair, hours apart, and the second says in
    // its own note that it is not a direction reading. By date alone they are
    // one reading printed twice.
    const page = renderPage({
      ...EMPTY,
      research: [
        reading('2026-07-29', 52_857, {
          at: '2026-07-29T18:40:00+03:00',
          earlier: [reading('2026-07-29', 48_000, { at: '2026-07-29T09:15:00+03:00' })],
        }),
      ],
    });

    expect(panel(page, 'housing')).toContain('09:15');
  });

  it('counts a corrected district reading apart from a genuine earlier one', () => {
    const page = renderPage({
      ...EMPTY,
      research: [
        reading('2026-07-29', 52_857, {
          earlier: [
            reading('2026-07-20', 48_000, { corrected: true }),
            reading('2026-07-13', 46_000),
          ],
        }),
      ],
    });

    expect(panel(page, 'housing')).toContain('1 eski okuma, 1 düzeltme');
  });

  it('says on the reading itself that it was replaced', () => {
    // Opened, a corrected reading shows the figures it got wrong. Nothing on
    // the table says so, and the whole point of keeping it is that it was
    // wrong — so the label has to travel with it, not only with the count.
    const page = renderPage({
      ...EMPTY,
      research: [
        reading('2026-07-29', 52_857, {
          earlier: [reading('2026-07-20', 48_000, { corrected: true })],
        }),
      ],
    });

    expect(panel(page, 'housing')).toContain('yerine yenisi yazıldı');
  });

  it('adds nothing to a district looked at once', () => {
    const page = renderPage({ ...EMPTY, research: [reading('2026-07-29', 52_857)] });

    expect(panel(page, 'housing')).not.toContain('eski okuma');
  });
});
