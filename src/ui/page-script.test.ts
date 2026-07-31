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
  rates: [
    {
      schema_version: 1,
      bank: 'Ziraat Bankası',
      kind: 'faiz',
      captured_on: '2026-07-27',
      source_url: 'https://example.test/konut',
      offers: [{ product: 'Konut Kredisi', monthly_rate: RATE }],
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
    expect(page.text('ask-status')).toContain('isteniyor');

    await new Promise((resolve) => setTimeout(resolve, 0));

    // Still disabled after the POST returns: the agent run has barely started,
    // and a button that looks idle gets pressed again.
    expect(page.text('ask-status')).toContain('sıraya alındı');
    expect(page.disabled('#ask-rates')).toBe(true);
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
