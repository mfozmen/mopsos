import { describe, expect, it } from 'vitest';

import { buildTabs, renderPage, type PageData } from './render.js';

const MODULES = [
  { id: 'housing', label_tr: 'Konut', kind: 'target' as const },
  { id: 'precious_metals', label_tr: 'Altın & Gümüş', kind: 'instrument' as const },
  { id: 'fx', label_tr: 'Döviz', kind: 'instrument' as const },
  { id: 'equities', label_tr: 'Hisse', kind: 'instrument' as const },
  { id: 'funds', label_tr: 'Fonlar', kind: 'instrument' as const },
];

const EMPTY: PageData = {
  modules: MODULES,
  research: [],
  instruments: [],
  records: [],
  finance: { bundle: 'var Mortgage = {};', rules: { term: { max_months: 120 } } },
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

  it('opens on the goal rather than on a place money waits', () => {
    expect(buildTabs(MODULES)[0]?.id).toBe('konut');
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

    expect(panel(html, 'konut')).not.toContain('hidden');
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
    const konut = panel(renderPage(EMPTY), 'konut');

    for (const field of ['price', 'downPayment', 'rate', 'months', 'energyClass', 'budget']) {
      expect(konut).toContain(`id="${field}"`);
    }
  });

  it('is a section of that tab, under its own heading', () => {
    expect(panel(renderPage(EMPTY), 'konut')).toMatch(/Finansman/);
  });

  it('leaves the market research above it, since that comes first', () => {
    const konut = panel(renderPage(EMPTY), 'konut');

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
    expect(panel(renderPage(EMPTY), 'konut')).toMatch(/ekspertiz/i);
  });

  it('says no tax is applied, because that is a real difference from a consumer loan', () => {
    expect(panel(renderPage(EMPTY), 'konut')).toMatch(/KKDF|BSMV/);
  });

  it('does not put the reader’s numbers anywhere but the page', () => {
    // Amounts are personal data. Nothing here may post, store or persist them.
    const html = renderPage(EMPTY);

    expect(html).not.toMatch(/fetch\(|localStorage|XMLHttpRequest|navigator\.sendBeacon/);
  });
});

describe('instrument tabs', () => {
  it('says what each instrument tab will hold rather than just "empty"', () => {
    const html = renderPage(EMPTY);

    // Gold is for parking a down payment, not for its own sake — the empty
    // state should say so, because that is why the tab exists.
    expect(panel(html, 'precious_metals')).toMatch(/peşinat/i);
  });

  it('mentions certificates under funds, which is a route to a flat', () => {
    expect(panel(renderPage(EMPTY), 'funds')).toMatch(/sertifika/i);
  });
});

describe('empty states say what is missing, not just that something is', () => {
  it('tells you no research has been done rather than showing a blank page', () => {
    expect(panel(renderPage(EMPTY), 'konut')).toMatch(/araştırma/i);
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
    const konut = panel(renderPage(data), 'konut');

    expect(konut).toContain('Egekent 2');
    expect(konut).toContain('48.500');
  });

  it('names the source of every figure', () => {
    // A number with no source cannot be checked later, and an unverifiable
    // number is worse than a missing one because it looks like knowledge.
    expect(panel(renderPage(data), 'konut')).toContain('Endeksa');
  });

  it('says when the research was done, since the market moves', () => {
    expect(panel(renderPage(data), 'konut')).toContain('27.07.2026');
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
