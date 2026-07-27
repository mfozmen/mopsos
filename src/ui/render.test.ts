import { describe, expect, it } from 'vitest';

import { renderPage, type PageData } from './render.js';

const MODULES = [
  { id: 'housing', name: 'Konut & Mortgage', status: 'empty' as const },
  { id: 'fx', name: 'Döviz', status: 'empty' as const },
];

const VERDICT = {
  id: '2026-07-26-housing-menemen-12m',
  seer: 'cautious',
  asset_class: 'housing',
  question: 'Haziran 2027 konut fiyat endeksi 62.0 üzerinde olacak.',
  probability: 0.58,
  horizon_days: 339,
  check_after: '2027-07-16',
  is_probe: false,
};

const DATA: PageData = {
  modules: MODULES,
  verdicts: [VERDICT],
  records: [],
};

describe('renderPage', () => {
  it('names every asset class, so a tab is never silently missing', () => {
    const html = renderPage(DATA);

    expect(html).toContain('Konut &amp; Mortgage');
    expect(html).toContain('Döviz');
  });

  it('leads with the headline call and its probability', () => {
    const html = renderPage(DATA);

    expect(html).toContain('Haziran 2027 konut fiyat endeksi 62.0 üzerinde olacak.');
    expect(html).toContain('58');
  });

  it('leads with the longest-horizon call, not a probe', () => {
    const probe = { ...VERDICT, id: 'p', question: 'Dört haftalık prob.', horizon_days: 28, is_probe: true };
    const html = renderPage({ ...DATA, verdicts: [probe, VERDICT] });
    const headline = html.indexOf('class="headline-question"');

    expect(html.slice(headline, headline + 200)).toContain('Haziran 2027');
  });

  it('says a class is not configured rather than showing an empty chart', () => {
    expect(renderPage({ ...DATA, verdicts: [] })).toContain('Henüz kurulmadı');
  });

  it('says plainly that nothing has been scored yet', () => {
    // An empty record must never look like a good record.
    expect(renderPage(DATA)).toContain('Henüz ölçülmüş tahmin yok');
  });

  it('shows a seer record with its Brier score and calibration', () => {
    const html = renderPage({
      ...DATA,
      records: [{ seer: 'cautious', count: 6, brier: 0.19, predicted: 0.62, observed: 0.5 }],
    });

    expect(html).toContain('0.19');
    expect(html).toContain('cautious');
  });

  it('escapes content instead of letting it become markup', () => {
    const nasty = { ...VERDICT, question: '<script>alert(1)</script>' };

    expect(renderPage({ ...DATA, verdicts: [nasty] })).not.toContain('<script>alert(1)</script>');
  });

  it('is a complete standalone document, since it opens from a file', () => {
    const html = renderPage(DATA);

    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).not.toContain('http://');
    expect(html).not.toContain('https://');
  });
});
