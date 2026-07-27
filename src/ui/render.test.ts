import { describe, expect, it } from 'vitest';

import { renderPage, TABS, type PageData } from './render.js';

const EMPTY: PageData = {
  research: [],
  alternatives: [],
  records: [],
};

function panel(html: string, id: string): string {
  const start = html.indexOf(`id="panel-${id}"`);
  const end = html.indexOf('<section', start + 1);
  return html.slice(start, end === -1 ? undefined : end);
}

describe('the four tabs', () => {
  it('shows every tab, named in Turkish', () => {
    const html = renderPage(EMPTY);

    for (const tab of TABS) {
      expect(html).toContain(tab.name);
    }
  });

  it('has exactly four', () => {
    // Konut, Finansman, Alternatifler, Sicil. A fifth means a decision was made
    // somewhere other than here.
    expect(TABS).toHaveLength(4);
  });

  it('leads with Konut, which is what the tool is for', () => {
    expect(TABS[0]?.id).toBe('konut');
  });

  it('marks exactly one tab selected', () => {
    const html = renderPage(EMPTY);
    // Anchored on the aria-label and searched forward from it: every role
    // appears in the stylesheet too, and the stylesheet comes first.
    const start = html.indexOf('aria-label="Bölümler"');
    const tablist = html.slice(start, html.indexOf('role="tabpanel"', start));

    expect(tablist.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(tablist.match(/aria-selected="false"/g)).toHaveLength(TABS.length - 1);
  });

  it('hides every panel except the first, so one tab is one screen', () => {
    const html = renderPage(EMPTY);

    expect(panel(html, 'konut')).not.toContain('hidden');
    expect(panel(html, 'finansman')).toContain('hidden');
  });

  it('wires each tab to the panel it controls', () => {
    const html = renderPage(EMPTY);

    for (const tab of TABS) {
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
