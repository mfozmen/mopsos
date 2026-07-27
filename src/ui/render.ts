export interface Tab {
  id: string;
  name: string;
  /** Shown when the panel has nothing in it yet. */
  emptyState: string;
}

/** The minimum a module has to declare for the interface to place it. */
export interface TabModule {
  id: string;
  label_tr: string;
  kind: 'target' | 'instrument';
}

const KONUT_EMPTY =
  'Henüz araştırma yok. Bir il ve ilçe seçip agent’ı gönderdiğinde bulduğu mahalle fiyatları, kira getirileri ve piyasa altı ilanlar burada birikir.';

const FINANSMAN: Tab = {
  id: 'finansman',
  name: 'Finansman',
  emptyState: 'Hesaplayıcı hazırlanıyor.',
};

const SICIL: Tab = {
  id: 'sicil',
  name: 'Sicil',
  emptyState:
    'Henüz ölçülmüş bir öngörü yok. Agent’ın vadesi gelen ilk tahmini ölçüldüğünde sicil burada başlar.',
};

/**
 * What each instrument tab is for.
 *
 * Every one of them answers the same question from a different angle: while the
 * down payment grows, is this a better place for it than the alternatives? None
 * of them is here as an investment in its own right, and the empty states say so
 * — a tab that does not explain why it exists gets filled with whatever is easy
 * to measure rather than whatever matters.
 */
const INSTRUMENT_EMPTY: Record<string, string> = {
  precious_metals:
    'Henüz kurulmadı. Gram altın ve gümüşün TL getirisi buraya gelecek — peşinat biriktirirken paranın burada durmasının konut fiyatlarına karşı kazandırıp kazandırmadığı sorusu.',
  fx: 'Henüz kurulmadı. Kur ve TL mevduat faizi yan yana gelecek — peşinatı dövizde tutmanın, faizde tutmanın ve konut fiyat artışının karşılaştırması.',
  equities:
    'Henüz kurulmadı. BIST endeksleri ve izlediğin hisseler buraya gelecek. Vadesi peşinat hedefinden kısa olan para için.',
  funds:
    'Henüz kurulmadı. Yatırım fonları ve gayrimenkul sertifikaları buraya gelecek — Damla Kent gibi projeler dahil. Daireyi bütün almak yerine sertifika biriktirip sonra daireye çevirme yolu da bir seçenek.',
};

function instrumentTab(module: TabModule): Tab {
  return {
    id: module.id,
    name: module.label_tr,
    emptyState:
      INSTRUMENT_EMPTY[module.id] ??
      `Henüz kurulmadı. ${module.label_tr} getirileri buraya gelecek.`,
  };
}

/**
 * The tab strip, built from the registry rather than written out here.
 *
 * Konut first because it is the goal, Finansman second because it is how the
 * goal gets paid for, then every instrument the registry knows about, and Sicil
 * last because it looks backwards rather than forwards.
 *
 * Instruments come from the registry so that adding one stays a matter of adding
 * a folder. A list written here would quietly make that untrue.
 */
export function buildTabs(modules: TabModule[]): Tab[] {
  const target = modules.find((module) => module.kind === 'target');
  const instruments = modules.filter((module) => module.kind === 'instrument');

  return [
    { id: 'konut', name: target?.label_tr ?? 'Konut', emptyState: KONUT_EMPTY },
    FINANSMAN,
    ...instruments.map(instrumentTab),
    SICIL,
  ];
}

export interface Neighbourhood {
  name: string;
  sale_per_m2: number;
  rent_per_m2: number;
  /** Annual gross rental yield, as a fraction. */
  gross_yield: number;
  listing_count: number;
  /** Where the figures came from. A figure with no source does not get shown. */
  source: string;
}

export interface ResearchReport {
  place: string;
  /** ISO date the research was done. */
  dated: string;
  neighbourhoods: Neighbourhood[];
}

export interface InstrumentReturn {
  /** Module id the figure belongs to. */
  module: string;
  name: string;
  annual_return: number;
  source: string;
}

export interface SeerRecord {
  seer: string;
  count: number;
  brier: number;
  predicted: number;
  observed: number;
}

export interface PageData {
  modules: TabModule[];
  research: ResearchReport[];
  instruments: InstrumentReturn[];
  records: SeerRecord[];
}

function escape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Turkish number formatting: 48.500 rather than 48,500. */
function tl(value: number): string {
  return value.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
}

function percent(fraction: number): string {
  return `%${(fraction * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`;
}

function turkishDate(iso: string): string {
  const [year = '', month = '', day = ''] = iso.split('-');
  return `${day}.${month}.${year}`;
}

function neighbourhoodRow(neighbourhood: Neighbourhood): string {
  return `
          <tr>
            <td>${escape(neighbourhood.name)}</td>
            <td class="num">${tl(neighbourhood.sale_per_m2)}</td>
            <td class="num">${tl(neighbourhood.rent_per_m2)}</td>
            <td class="num">${percent(neighbourhood.gross_yield)}</td>
            <td class="num">${tl(neighbourhood.listing_count)}</td>
            <td class="src">${escape(neighbourhood.source)}</td>
          </tr>`;
}

function reportSection(report: ResearchReport): string {
  return `
      <h3>${escape(report.place)}<span class="dated">${turkishDate(report.dated)}</span></h3>
      <table>
        <thead>
          <tr>
            <th>Mahalle</th>
            <th class="num">m² satış</th>
            <th class="num">m² kira</th>
            <th class="num">Getiri</th>
            <th class="num">İlan</th>
            <th class="src">Kaynak</th>
          </tr>
        </thead>
        <tbody>${report.neighbourhoods.map(neighbourhoodRow).join('')}
        </tbody>
      </table>`;
}

function panelBody(tab: Tab, data: PageData): string {
  const empty = `<p class="empty">${escape(tab.emptyState)}</p>`;

  if (tab.id === 'konut') {
    return data.research.length === 0 ? empty : data.research.map(reportSection).join('');
  }

  if (tab.id === 'sicil') {
    // Deliberately no number when there is nothing measured. Zero is the best
    // possible Brier score and an unmeasured seer must not appear to have earned it.
    return data.records.length === 0 ? empty : '';
  }

  return data.instruments.some((entry) => entry.module === tab.id) ? '' : empty;
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
  body { margin: 0; background: var(--ground); color: var(--ink);
    font-family: var(--sans); font-size: 15px; line-height: 1.55; }
  .wrap { max-width: 52rem; margin: 0 auto; padding: 3rem 1.5rem 6rem; }
  header { display: flex; align-items: baseline; gap: 1rem; flex-wrap: wrap; }
  .brand { font-family: var(--serif); font-size: 1.25rem; letter-spacing: .04em; margin: 0; }
  .brand small { display: block; font-family: var(--sans); font-size: .7rem; letter-spacing: .16em;
    text-transform: uppercase; color: var(--muted); font-weight: 600; }
  [role="tablist"] { display: flex; gap: .35rem; flex-wrap: wrap; margin: 2.5rem 0 0;
    border-bottom: 1px solid var(--line); }
  [role="tab"] { font: inherit; font-size: .82rem; letter-spacing: .06em; background: none;
    border: 0; border-bottom: 2px solid transparent; color: var(--muted); cursor: pointer;
    padding: .5rem .9rem; margin-bottom: -1px; }
  [role="tab"]:hover { color: var(--ink); }
  [role="tab"][aria-selected="true"] { color: var(--ink); border-bottom-color: var(--measured);
    font-weight: 600; }
  [role="tab"]:focus-visible { outline: 2px solid var(--measured); outline-offset: -2px; }
  [role="tabpanel"] { padding-top: 2.5rem; }
  [role="tabpanel"][hidden] { display: none; }
  h3 { font-family: var(--serif); font-size: 1.35rem; font-weight: normal; margin: 0 0 1rem;
    display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; }
  h3 .dated { font-family: var(--mono); font-size: .75rem; color: var(--muted); }
  table { width: 100%; border-collapse: collapse; font-size: .9rem; margin-bottom: 2.5rem; }
  th { text-align: left; font-weight: 600; font-size: .66rem; letter-spacing: .1em;
    text-transform: uppercase; color: var(--muted); padding: 0 1rem .5rem 0;
    border-bottom: 1px solid var(--line); white-space: nowrap; }
  td { padding: .75rem 1rem .75rem 0; border-bottom: 1px solid var(--line); }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.num { font-family: var(--serif); font-size: 1rem; }
  .src { font-family: var(--mono); font-size: .75rem; color: var(--muted); padding-right: 0; }
  .empty { color: var(--muted); font-family: var(--serif); font-size: 1.05rem;
    background: var(--surface); border: 1px solid var(--line); padding: 1.25rem 1.4rem; margin: 0;
    max-width: 40rem; }
  footer { margin-top: 5rem; padding-top: 1rem; border-top: 1px solid var(--line);
    font-size: .75rem; color: var(--muted); }
  @media (max-width: 34rem) { .src { display: none; } }
`;

/**
 * Tab switching, and nothing else.
 *
 * Without scripting every panel stays visible, which is a worse layout but still
 * the whole page — the content never depends on the script having run.
 */
const SCRIPT = `
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const select = (id) => {
    for (const tab of tabs) {
      const chosen = tab.dataset.tab === id;
      tab.setAttribute('aria-selected', String(chosen));
      tab.tabIndex = chosen ? 0 : -1;
      document.getElementById('panel-' + tab.dataset.tab).hidden = !chosen;
    }
    history.replaceState(null, '', '#' + id);
  };
  for (const tab of tabs) tab.addEventListener('click', () => select(tab.dataset.tab));
  document.querySelector('[role="tablist"]').addEventListener('keydown', (event) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!step) return;
    const current = tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true');
    const next = tabs[(current + step + tabs.length) % tabs.length];
    next.focus();
    select(next.dataset.tab);
  });
  if (location.hash) {
    const wanted = location.hash.slice(1);
    if (tabs.some((tab) => tab.dataset.tab === wanted)) select(wanted);
  }
`;

/**
 * The whole page, as one self-contained document.
 *
 * Read-only by construction: generated from the record, with no way to write
 * back to it, and nothing loaded from the network.
 */
export function renderPage(data: PageData): string {
  const tabs = buildTabs(data.modules);
  const tablist = tabs
    .map(
      (tab, index) =>
        `<button role="tab" id="tab-${tab.id}" data-tab="${tab.id}"
                aria-controls="panel-${tab.id}" aria-selected="${index === 0}"
                tabindex="${index === 0 ? 0 : -1}">${escape(tab.name)}</button>`,
    )
    .join('\n        ');

  const panels = tabs
    .map(
      (tab, index) => `
      <section role="tabpanel" id="panel-${tab.id}" aria-labelledby="tab-${tab.id}"${
        index === 0 ? '' : ' hidden'
      }>${panelBody(tab, data)}
      </section>`,
    )
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
      <h1 class="brand">Mopsos<small>ev alma araştırması</small></h1>
    </header>

    <div role="tablist" aria-label="Bölümler">
        ${tablist}
    </div>
${panels}

    <footer>
      Bu sayfa kayıttan üretildi ve hiçbir şey yazmaz.
      Yeniden üretmek için: <code>npm run ui</code>
    </footer>
  </div>
  <script>${SCRIPT}</script>
</body>
</html>
`;
}
