export interface ModuleTab {
  id: string;
  name: string;
  status: 'configured' | 'incomplete' | 'empty';
}

export interface OpenVerdict {
  id: string;
  seer: string;
  asset_class: string;
  question: string;
  probability: number;
  horizon_days: number;
  check_after: string;
  is_probe: boolean;
}

export interface SeerRecord {
  seer: string;
  /** Records are never compared across classes, so the class is part of one. */
  asset_class: string;
  count: number;
  brier: number;
  /** Mean stated confidence. */
  predicted: number;
  /** Fraction that actually happened. */
  observed: number;
}

export interface PageData {
  modules: ModuleTab[];
  verdicts: OpenVerdict[];
  records: SeerRecord[];
}

function escape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function turkishDate(iso: string): string {
  const [year = '', month = '', day = ''] = iso.split('-');
  return `${day}.${month}.${year}`;
}

function horizonLabel(days: number): string {
  if (days < 60) return `${days} gün`;
  if (days < 400) return `${Math.round(days / 30)} ay`;
  return `${(days / 365).toFixed(1)} yıl`;
}

/**
 * The one call the tab is about: the longest-horizon open verdict.
 *
 * Probes are excluded deliberately. They exist to calibrate a seer, not to be
 * acted on, and leading with one would put a four-week technicality where the
 * actual decision belongs.
 */
function headline(verdicts: OpenVerdict[]): OpenVerdict | undefined {
  return [...verdicts]
    .filter((verdict) => !verdict.is_probe)
    .sort((a, b) => b.horizon_days - a.horizon_days)[0];
}

/**
 * The signature element: what the seer said and what actually happened, as two
 * marks on one line. The distance between them is the calibration, shown rather
 * than described — a seer saying 90% and being right 60% of the time has a
 * visible gap, and no number needs to explain it.
 */
function reckoningLine(record: SeerRecord): string {
  const said = Math.round(record.predicted * 100);
  const happened = Math.round(record.observed * 100);

  return `
      <div class="reckoning" role="img"
           aria-label="Ortalama dediği yüzde ${said}, gerçekleşme oranı yüzde ${happened}">
        <span class="scale-end left">%0</span>
        <span class="scale-end right">%100</span>
        <span class="reckoning-mark said" style="left:${said}%"><i>dedi %${said}</i></span>
        <span class="reckoning-mark happened" style="left:${happened}%"><i>oldu %${happened}</i></span>
      </div>`;
}

function verdictRow(verdict: OpenVerdict): string {
  return `
        <tr>
          <td class="q">${escape(verdict.question)}
            ${verdict.is_probe ? '<span class="tag">prob</span>' : ''}
          </td>
          <td class="num">%${Math.round(verdict.probability * 100)}</td>
          <td class="who">${escape(verdict.seer)}</td>
          <td class="when">${turkishDate(verdict.check_after)}</td>
        </tr>`;
}

function recordRow(record: SeerRecord): string {
  return `
      <li class="record">
        <div class="record-head">
          <span class="who">${escape(record.seer)}</span>
          <span class="brier">${record.brier.toFixed(2)}<em>brier</em></span>
          <span class="count">${record.count} ölçülmüş tahmin</span>
        </div>
        ${reckoningLine(record)}
      </li>`;
}

function modulePanel(module: ModuleTab, verdicts: OpenVerdict[], records: SeerRecord[]): string {
  if (verdicts.length === 0) {
    const reason =
      module.status === 'incomplete'
        ? 'Bu sınıfta tek seer tanımlı. İkinci seer eklenene kadar sicil bir şey ölçmez.'
        : 'Henüz kurulmadı. Bu sınıf için seer tanımlanınca açılır.';
    return `
      <p class="empty">${reason}</p>`;
  }

  const lead = headline(verdicts);
  const record = lead ? records.find((entry) => entry.seer === lead.seer) : undefined;

  const head = lead
    ? `
      <p class="eyebrow">Şu anki çağrı</p>
      <div class="headline">
        <p class="headline-question">${escape(lead.question)}</p>
        <p class="headline-number"><span>%</span>${Math.round(lead.probability * 100)}</p>
      </div>
      <p class="headline-meta">${
        record
          ? `${escape(lead.seer)} · ${record.count} ölçülmüş tahminde brier ${record.brier.toFixed(2)}`
          : `${escape(lead.seer)} · henüz ölçülmüş tahmini yok`
      } · ${horizonLabel(lead.horizon_days)} · ${turkishDate(lead.check_after)} tarihinde ölçülür</p>`
    : `
      <p class="eyebrow">Şu anki çağrı</p>
      <p class="empty">Açık uzun vadeli çağrı yok. Aşağıdakiler yalnızca seer’ı ölçen kalibrasyon probları.</p>`;

  return `${head}

      <h2>Açık tahminler</h2>
      <table>
        <thead>
          <tr><th>Soru</th><th class="num">Olasılık</th><th class="who">Seer</th><th class="when">Ölçüm günü</th></tr>
        </thead>
        <tbody>${verdicts.map(verdictRow).join('')}
        </tbody>
      </table>

      <h2>Sicil</h2>
      ${
        records.length === 0
          ? '<p class="empty">Henüz ölçülmüş tahmin yok. Sicil, ilk tahminin vadesi geldiğinde başlar.</p>'
          : `<ul class="records">${records.map(recordRow).join('')}
      </ul>`
      }`;
}

const STYLE = `
  :root {
    --ground: #e9e7e0;
    --surface: #f5f4f0;
    --ink: #22252a;
    --muted: #6e7178;
    --line: #cfccc3;
    --measured: #0f6e68;
    --pending: #9a6b12;
    --serif: Constantia, Cambria, Georgia, serif;
    --sans: "Segoe UI", system-ui, sans-serif;
    --mono: Consolas, ui-monospace, monospace;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--ground); color: var(--ink);
    font-family: var(--sans); font-size: 15px; line-height: 1.55;
  }
  .wrap { max-width: 46rem; margin: 0 auto; padding: 3rem 1.5rem 6rem; }
  header { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
  .brand { font-family: var(--serif); font-size: 1.25rem; letter-spacing: .04em; margin: 0; }
  .brand small { display: block; font-family: var(--sans); font-size: .7rem; letter-spacing: .16em;
    text-transform: uppercase; color: var(--muted); font-weight: 600; }
  nav { display: flex; gap: 1.25rem; flex-wrap: wrap; }
  nav a { font-size: .8rem; letter-spacing: .1em; text-transform: uppercase; text-decoration: none;
    color: var(--muted); padding-bottom: .25rem; border-bottom: 2px solid transparent; }
  nav a[aria-current] { color: var(--ink); border-bottom-color: var(--measured); }
  nav a:focus-visible { outline: 2px solid var(--measured); outline-offset: 3px; }
  main { margin-top: 3.5rem; }
  .eyebrow { font-size: .7rem; letter-spacing: .18em; text-transform: uppercase;
    color: var(--muted); font-weight: 600; margin: 0 0 .75rem; }
  .headline { display: flex; align-items: flex-start; justify-content: space-between; gap: 2rem; }
  .headline-question { font-family: var(--serif); font-size: 1.9rem; line-height: 1.25;
    margin: 0; max-width: 30rem; text-wrap: balance; }
  .headline-number { font-family: var(--serif); font-size: 3.6rem; line-height: 1; margin: 0;
    font-variant-numeric: oldstyle-nums; color: var(--measured); white-space: nowrap; }
  .headline-number span { font-size: 1.4rem; vertical-align: .9rem; color: var(--muted); }
  .headline-meta { color: var(--muted); font-size: .85rem; margin: 1rem 0 0;
    padding-top: 1rem; border-top: 1px solid var(--line); }
  h2 { font-family: var(--sans); font-size: .72rem; letter-spacing: .18em; text-transform: uppercase;
    color: var(--muted); font-weight: 600; margin: 3.5rem 0 .9rem; }
  h2.class-name { color: var(--ink); font-size: .78rem; margin-top: 4.5rem;
    padding-bottom: .6rem; border-bottom: 1px solid var(--line); }
  table { width: 100%; border-collapse: collapse; font-size: .9rem; }
  th { text-align: left; font-weight: 600; font-size: .68rem; letter-spacing: .1em;
    text-transform: uppercase; color: var(--muted); padding: 0 0 .5rem; border-bottom: 1px solid var(--line); }
  td { padding: .8rem 0; border-bottom: 1px solid var(--line); vertical-align: top; }
  td.q { padding-right: 1.5rem; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap;
    padding-right: 1.75rem; }
  td.num { font-family: var(--serif); font-size: 1.05rem; }
  th.who, th.when { padding-right: 0; }
  .who { font-family: var(--mono); font-size: .78rem; color: var(--muted); white-space: nowrap;
    padding-right: 1.75rem; }
  .when { font-family: var(--mono); font-size: .78rem; color: var(--muted); white-space: nowrap;
    text-align: right; }
  .tag { font-size: .62rem; letter-spacing: .1em; text-transform: uppercase; color: var(--pending);
    border: 1px solid var(--pending); border-radius: 2px; padding: .05rem .3rem; margin-left: .4rem;
    white-space: nowrap; }
  .records { list-style: none; margin: 0; padding: 0; }
  .record { padding: 1.1rem 0 1.6rem; border-bottom: 1px solid var(--line); }
  .record-head { display: flex; align-items: baseline; gap: .9rem; }
  .record-head .brier { font-family: var(--serif); font-size: 1.5rem; font-variant-numeric: oldstyle-nums; }
  .record-head .brier em { font-style: normal; font-family: var(--sans); font-size: .62rem;
    letter-spacing: .14em; text-transform: uppercase; color: var(--muted); margin-left: .35rem; }
  .record-head .count { font-size: .8rem; color: var(--muted); margin-left: auto; }
  .reckoning { position: relative; height: 2.9rem; margin-top: 1.6rem;
    border-top: 1px solid var(--line); }
  .scale-end { position: absolute; bottom: 0; font-size: .62rem; color: var(--muted);
    font-variant-numeric: tabular-nums; }
  .scale-end.left { left: 0; }
  .scale-end.right { right: 0; }
  .reckoning-mark { position: absolute; top: -1px; transform: translateX(-50%); }
  .reckoning-mark::before { content: ""; display: block; width: 1px; height: .7rem;
    margin: 0 auto; background: currentColor; }
  .reckoning-mark i { display: block; font-style: normal; font-size: .65rem; letter-spacing: .1em;
    text-transform: uppercase; margin-top: .2rem; white-space: nowrap; }
  .reckoning-mark.said { color: var(--pending); }
  .reckoning-mark.happened { color: var(--measured); z-index: 1; }
  .reckoning-mark.happened i { margin-top: 1.15rem; }
  .reckoning-mark.happened::before { height: 1.85rem; }
  .empty { color: var(--muted); font-family: var(--serif); font-size: 1.05rem;
    background: var(--surface); border: 1px solid var(--line); padding: 1.25rem 1.4rem; margin: 0; }
  footer { margin-top: 5rem; padding-top: 1rem; border-top: 1px solid var(--line);
    font-size: .75rem; color: var(--muted); }
  @media (max-width: 34rem) {
    .headline { flex-direction: column; gap: .75rem; }
    .headline-question { font-size: 1.5rem; }
    .who, .when { display: none; }
  }
`;

/**
 * The whole page, as one self-contained document.
 *
 * Read-only by construction: it is generated from the repository and has no way
 * to write back. Nothing is loaded from the network either, so it opens from a
 * file and keeps working with no connection.
 */
export function renderPage(data: PageData): string {
  const first = data.modules[0];
  const tabs = data.modules
    .map(
      (module) =>
        `<a href="#${escape(module.id)}"${module.id === first?.id ? ' aria-current="page"' : ''}>${escape(module.name)}</a>`,
    )
    .join('\n        ');

  // Each class gets its own panel over its own verdicts and its own record.
  // Filtering here rather than in the panel is what makes it impossible for one
  // class's call to be presented as another's.
  const panels = data.modules
    .map((module, index) => {
      const verdicts = data.verdicts.filter((verdict) => verdict.asset_class === module.id);
      const records = data.records.filter((record) => record.asset_class === module.id);
      const heading =
        index === 0 ? '' : `\n        <h2 class="class-name">${escape(module.name)}</h2>`;

      return `
      <section id="${escape(module.id)}">${heading}${modulePanel(module, verdicts, records)}
      </section>`;
    })
    .join('');

  return `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Mopsos</title>
  <style>${STYLE}</style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1 class="brand">Mopsos<small>tahmin ve hesaplaşma</small></h1>
      <nav>
        ${tabs}
      </nav>
    </header>

    <main>${panels}
    </main>

    <footer>
      Bu sayfa depodaki dosyalardan üretildi ve hiçbir şey yazmaz.
      Yeniden üretmek için: <code>npm run ui</code>
    </footer>
  </div>
</body>
</html>
`;
}
