import { annualCostRate } from '../finance/effective.js';
import { type MortgageRules } from '../finance/mortgage.js';
import { owningVsRenting } from '../market/affordability.js';
import { byCodePoint } from '../order.js';
import { gatedOn } from '../rates/eligibility.js';
import {
  bestOffer,
  headlineMisleads,
  type RateOffer,
  type RateReport,
  type ShownRateReport,
  trueMonthlyRate,
} from '../rates/load.js';
import { type Movement, moved } from '../rates/movement.js';
import { planCost } from '../savings/compare.js';
import { type SavingsFinanceReport } from '../savings/load.js';

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
}

/** Where the housing module's own research lands. */
const HOUSING_EMPTY =
  'Henüz araştırma yok. Bir il ve ilçe seçip agent’ı gönderdiğinde bulduğu mahalle fiyatları, kira getirileri ve piyasa altı ilanlar burada birikir.';

const SICIL: Tab = {
  id: 'sicil',
  name: 'Sicil',
  emptyState:
    'Henüz ölçülmüş bir öngörü yok. Agent’ın vadesi gelen ilk tahmini ölçüldüğünde sicil burada başlar.',
};

/**
 * What each tab will hold.
 *
 * Each is an investment in its own right, compared against the others on the
 * same terms: what it returned, over what period, and how reliably. An earlier
 * version described them as places a house deposit waits, which was the wrong
 * idea of the product — the goal is investing, and housing is simply the one
 * being built first.
 *
 * A tab that does not say what it will hold gets filled with whatever is easy to
 * measure rather than whatever matters.
 */
const MODULE_EMPTY: Record<string, string> = {
  precious_metals:
    'Henüz kurulmadı. Gram altın ve gümüşün TL getirisi buraya gelecek — diğer araçlarla aynı ölçüde karşılaştırılabilir şekilde.',
  fx: 'Henüz kurulmadı. Kur hareketi ve TL mevduat faizi buraya gelecek; ikisi birlikte, çünkü döviz tutmanın getirisi faizden vazgeçmekle birlikte anlam kazanır.',
  equities: 'Henüz kurulmadı. BIST endeksleri ve izlediğin hisseler buraya gelecek.',
  funds:
    'Henüz kurulmadı. Yatırım fonları ve gayrimenkul sertifikaları buraya gelecek — Damla Kent gibi projeler dahil. Sertifika, daireyi bütün almadan gayrimenkule yatırım yapmanın bir yolu.',
};

function moduleTab(module: TabModule): Tab {
  return {
    id: module.id,
    name: module.label_tr,
    emptyState:
      module.id === 'housing'
        ? HOUSING_EMPTY
        : (MODULE_EMPTY[module.id] ??
          `Henüz kurulmadı. ${module.label_tr} getirileri buraya gelecek.`),
  };
}

/**
 * The tab strip: one tab per investment, in the registry's order, and Sicil last.
 *
 * Every tab is an investment, which is what makes them peers. Housing comes
 * first because it is the one being built first, not because it is a different
 * kind of thing — an earlier version encoded that difference in the data and it
 * was the wrong idea of the product.
 *
 * Financing is deliberately NOT a tab. It is not an investment; it is part of
 * buying a house, and it sits inside that tab. A tab strip that mixes kinds
 * stops being navigable, because the reader can no longer guess what a tab
 * holds from what the others hold.
 *
 * Tabs come from the registry so that adding an investment stays a matter of
 * adding a folder. A list written here would quietly make that untrue.
 */
export function buildTabs(modules: TabModule[]): Tab[] {
  return [...modules.map(moduleTab), SICIL];
}

export interface Neighbourhood {
  name: string;
  /**
   * Optional, because "nothing usable was found here" is a finding rather than a
   * failure — and one worth showing, since it says where to look next.
   */
  sale_per_m2?: number;
  rent_per_m2?: number;
  /** Annual gross rental yield, as a fraction. Derived from the two above. */
  gross_yield?: number;
  /** How many listings the figures rest on. A median over three of them is noise. */
  listing_count: number;
  /** Where the figures came from. A figure with no source does not get shown. */
  source: string;
  /** What qualifies the figure — thin data, a mix that would not hold still. */
  note?: string;
  /** How far the scout trusts its own figure. */
  confidence?: 'high' | 'medium' | 'low';
}

export interface ResearchReport {
  place: string;
  /** ISO date the research was done. */
  dated: string;
  /**
   * To the minute, where the reading recorded it. Mirrors `ShownMarketReport.at`.
   *
   * Two readings of one district on one date are in this record already, hours
   * apart. By date alone they are the same reading printed twice.
   */
  at?: string;
  /** Earlier readings of the same district, newest first. */
  earlier?: ResearchReport[];
  /** True when a later reading replaced this one because it was wrong. */
  corrected?: boolean;
  neighbourhoods: Neighbourhood[];
  /** What the run could not do — a site that refused it, a source it fell back to. */
  note?: string;
  /** What the scout makes of its own figures. Opinion, and shown as opinion. */
  reading?: string;
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

// The record's own shapes rather than a second declaration of them. Two
// definitions of one report is how the page came to sort offers by headline
// while the list around it sorted by real cost.
export type { RateOffer, RateReport, ShownRateReport } from '../rates/load.js';

export interface FinanceBundle {
  /** The compiled mortgage module, so the page and the tests share one implementation. */
  bundle: string;
  /** The pinned BDDK rules, applied identically in the browser. */
  rules: MortgageRules;
}

export interface PageData {
  modules: TabModule[];
  research: ResearchReport[];
  instruments: InstrumentReturn[];
  records: SeerRecord[];
  rates: ShownRateReport[];
  savings: SavingsFinanceReport[];
  finance: FinanceBundle;
}

/**
 * A question mark that explains a field.
 *
 * A button rather than a `title=` attribute, because a hover-only tooltip is
 * unreachable by keyboard and never appears on a phone — which is exactly where
 * a question mark gets tapped. The text is in the markup, so it is there for a
 * screen reader whether or not it is visible.
 */
function hint(text: string): string {
  return `<button type="button" class="hint" aria-label="Açıklama">?<span class="hint-body">${escape(text)}</span></button>`;
}

/**
 * A link out to the bank, or nothing when the recorded address is not one.
 *
 * Only http(s) survives. The address comes out of a file an agent wrote, and a
 * `javascript:` URL there would be running in the page that holds the amounts.
 */
function externalHref(url: string): string | undefined {
  return /^https?:\/\//.test(url) ? escape(url) : undefined;
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

/**
 * How stale the picture is, said once above everything it applies to.
 *
 * The first thing worth knowing before trusting any number here is whether
 * anything on the page is still current, and a per-row date column cannot
 * answer that — it takes reading every row and holding the oldest in your head.
 * Both ends are named because a fresh rate beside a four-day-old market reading
 * is a picture with a stale half, and the newest date alone hides it.
 *
 * The age itself is filled in by the browser rather than written in here. This
 * file is generated once and then sits on disk; a page built on Monday that
 * still says "1 gün önce" on Friday misinforms about exactly the thing the line
 * exists to report. Without scripting it degrades to the dates, which stay true.
 */
function freshness(data: PageData): string {
  const dates = [
    ...data.research.map((r) => r.dated),
    ...data.rates.map((r) => r.captured_on),
  ].sort(byCodePoint);

  const oldest = dates[0];
  const newest = dates[dates.length - 1];
  if (oldest === undefined || newest === undefined) return '';

  // "Sayfadaki", not "kayıttaki". The loaders keep the newest reading per bank
  // and per district, so older ones exist and are not counted here. Saying the
  // plain number would claim the record is smaller than it is.
  const count = `Sayfadaki ${dates.length} okuma`;
  const when =
    oldest === newest
      ? `tümü ${since(newest)} tarihli`
      : `en yenisi ${since(newest)}, en eskisi ${since(oldest)}`;

  return `
      <p class="freshness">${count} · ${when}</p>`;
}

function since(iso: string): string {
  return `<time datetime="${iso}" data-since="${iso}">${turkishDate(iso)}</time>`;
}

/**
 * The time of day, where a reading recorded one.
 *
 * Read off the timestamp rather than parsed into a Date: the offset written in
 * the record is the one the reading was taken at, and converting to the
 * reader's zone would move a nine o'clock reading to eight and call it the same
 * reading.
 */
function clockTime(at?: string): string {
  const time = at?.slice(11, 16);
  return time === undefined || time === '' ? '' : ` ${time}`;
}

function turkishDate(iso: string): string {
  const [year = '', month = '', day = ''] = iso.split('-');
  return `${day}.${month}.${year}`;
}

/**
 * Shown beside the count, because a figure whose reliability was recorded and
 * then not displayed is presented as though it were certain — which is the
 * opposite of what recording it was for.
 *
 * High is not marked. Everything on the page is a best reading; saying so on
 * the ones that are fine would make the word meaningless on the ones that are
 * not.
 */
const CONFIDENCE: Record<string, string> = { medium: 'orta güven', low: 'düşük güven' };

/** A dash where nothing was found. Zero would be a lie and NaN a bug report. */
function figure(value: number | undefined, format: (value: number) => string): string {
  return value === undefined ? '—' : format(value);
}

/**
 * What the instalment column rests on, stated because it is an assumption.
 *
 * A hundred square metres is a stand-in for "a flat", chosen so the column
 * compares neighbourhoods rather than sizes — every figure in the table is a
 * price per square metre, so the size cancels out of the ratio and only the
 * absolute lira depend on it.
 */
const ASSUMED = { squareMetres: 100, months: 120 };

/** What owning costs against renting, keyed by neighbourhood, plus its assumptions. */
interface Affordability {
  byName: Map<string, number>;
  monthlyRate: number;
  /** Whose rate it is, so the reader can go and check the one being assumed. */
  bank: string;
}

/**
 * The cheapest real monthly cost in the record, or nothing.
 *
 * Real, not headline: the whole point of the rates table is that the lowest
 * advertised rate was the dearest offer in it. And nothing rather than a
 * fallback — an instalment column resting on a guessed rate would be worse
 * than an absent one.
 */
/**
 * The cheapest rate anyone can walk in and take.
 *
 * Offers gated on a life situation are left out, and this is the one place it
 * matters most: the figure is computed when the page is generated, so unlike a
 * table row it cannot dim itself once the reader says the condition is not
 * theirs. Every neighbourhood's Taksit/Kira is measured against it at once, and
 * built on a rate most readers cannot take it understates what owning costs
 * everywhere on the page.
 *
 * A reader who does qualify sees a figure that is too cautious rather than too
 * flattering, and the note beside the column names the bank and the rate, so
 * the gap is theirs to close.
 */
function cheapestRealRate(reports: RateReport[]): { rate: number; bank: string } | undefined {
  const rates = reports.flatMap((report) =>
    report.offers.flatMap((offer) => {
      const real = gatedOn(offer).length > 0 ? undefined : trueMonthlyRate(offer);
      return real === undefined ? [] : [{ rate: real, bank: report.bank }];
    }),
  );

  return rates.sort((a, b) => a.rate - b.rate)[0];
}

/**
 * A sortable column heading.
 *
 * The `th` itself is the control rather than a button inside it: one heading
 * already contains a `?` button, and nesting buttons is invalid markup. So it
 * takes focus, answers Enter and Space, and carries `aria-sort` — which is what
 * makes the state audible. A caret drawn in CSS says it to one kind of reader
 * only.
 *
 * `none` on every column at load. The default order is explained in the caveat
 * under the rates table; marking a column as sorted before anyone touched it
 * would claim the reader chose it.
 */
function th(content: string, className?: string): string {
  const classes = className === undefined ? 'sortable' : `${className} sortable`;
  return `<th class="${classes}" aria-sort="none" tabindex="0">${content}</th>`;
}

function neighbourhoodRow(neighbourhood: Neighbourhood, timesRent?: number | null): string {
  // Three states, and the middle one matters: no column at all when no bank
  // rate can be computed, a dash when the column exists but this row has no
  // rent to compare against, and a figure otherwise. Emitting nothing in the
  // middle case would shift every cell after it one column left.
  const owning =
    timesRent === undefined
      ? ''
      : `<td class="num times-rent">${
          timesRent === null
            ? '—'
            : `${timesRent.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`
        }</td>`;

  return `
          <tr>
            <td>${escape(neighbourhood.name)}</td>
            <td class="num">${figure(neighbourhood.sale_per_m2, tl)}</td>
            <td class="num">${figure(neighbourhood.rent_per_m2, tl)}</td>
            <td class="num">${figure(neighbourhood.gross_yield, percent)}</td>
            ${owning}
            <td class="num">${tl(neighbourhood.listing_count)}${
              neighbourhood.confidence === undefined ||
              CONFIDENCE[neighbourhood.confidence] === undefined
                ? ''
                : `<span class="caution">${CONFIDENCE[neighbourhood.confidence] ?? ''}</span>`
            }</td>
            <td class="src">${escape(neighbourhood.source)}${
              neighbourhood.note === undefined
                ? ''
                : `<span class="caution">${escape(neighbourhood.note)}</span>`
            }</td>
          </tr>`;
}

/**
 * One district's reading, folded unless it is the newest.
 *
 * Three districts is sixty rows of table before the reader reaches anything
 * they can act on. The newest reading is the one being read; the others are
 * there to compare against, and a comparison is a decision — so they sit one
 * click away rather than in the way.
 *
 * The summary carries the place, the date and how much is inside, because a row
 * of dates is a filing cabinet and nobody opens one of those to decide
 * something.
 */
function reportSection(report: ResearchReport, cost?: Affordability, open = false): string {
  const owning = cost?.byName ?? new Map<string, number>();
  const heading = cost === undefined ? '' : th('Taksit/Kira', 'num');
  const count = report.neighbourhoods.length;

  return `
      <details class="report"${open ? ' open' : ''}>
      <summary><strong>${escape(report.place)}</strong><span class="dated">${turkishDate(
        report.dated,
      )}${clockTime(report.at)}</span>${
        // Opened, a corrected reading shows the figures it got wrong, and
        // nothing in the table says so. The label has to travel with the
        // reading rather than only with the count above it.
        report.corrected === true ? `<span class="was-replaced">yerine yenisi yazıldı</span>` : ''
      }<span class="how-many">${String(count)} mahalle</span></summary>
      <div class="scroller">
      <table>
        <thead>
          <tr>
            ${th(`Mahalle`)}
            ${th(`m² satış`, 'num')}
            ${th(`m² kira`, 'num')}
            ${th(`Getiri`, 'num')}
            ${heading}
            ${th(
              `İlan${hint(
                'Rakamın kaç ilana dayandığı, ve agent’ın ona ne kadar güvendiği. ' +
                  'Düşük güven: veri ince, dağınık, ya da ilan karışımı sabit tutulamamış — beş ilanlık bir medyan sayı kılığında gürültüdür. ' +
                  'Orta güven: anlamlı sayıda ilan var ama tek kaynaktan. ' +
                  'Yüksek güven: bunlara ek olarak ikinci bir kaynak ile çapraz doğrulanmış. ' +
                  'Yüksek, örneklem büyüklüğüyle değil ikinci kaynakla kazanılır; elle toplanan veri tanımı gereği orta güvende kalır.',
              )}`,
              'num',
            )}
            ${th(`Kaynak`, 'src')}
          </tr>
        </thead>
        <tbody>${report.neighbourhoods
          .map((n) =>
            neighbourhoodRow(n, cost === undefined ? undefined : (owning.get(n.name) ?? null)),
          )
          .join('')}
        </tbody>
      </table>
      </div>${
        // Opinion, and it has to look like opinion beside figures that are not.
        // A table with no reading makes the reader interpret it twice — once to
        // find the pattern, once to doubt it — but a reading typeset like a
        // measurement would be taken for one.
        // Three assumptions sit behind one number, and a ratio whose
        // assumptions are not stated is a figure the reader cannot argue with.
        cost === undefined
          ? ''
          : `\n      <p class="note">Taksit/Kira sütunu: ${String(ASSUMED.squareMetres)} m² daire, ` +
            `${String(ASSUMED.months)} ay vade, kayıttaki en ucuz <strong>gerçek</strong> oranla ` +
            `(${escape(cost.bank)}, aylık %${cost.monthlyRate.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) ` +
            `ve asgari peşinatla. Daire büyüklüğü orandan düşer; sonucu değiştiren vade ve orandır. ` +
            `Yeni evlilere özel ürünler bu orana girmez — sayfa üretilirken hesaplandığı için ` +
            `senin cevabına göre değişemiyor. Şehit yakını ve ilk ev gibi başka koşullu ürünler ` +
            `henüz ayırt edilmiyor, girebilirler.</p>`
      }${
        report.reading === undefined
          ? `\n      <p class="caution run">Bu raporda okuma yok — agent rakamları getirmiş ama ne anlama geldiğini yazmamış.</p>`
          : `\n      <aside class="reading"><h4>Okuma</h4><p>${escape(report.reading)}</p>
      <p class="disclaimer">Agent’ın yorumu — ölçüm değil. Yalnızca yukarıdaki rakamlara dayanır.</p></aside>`
      }${
        // What the run could not do belongs beside what it did. A report that
        // only shows its findings reads as complete, and this one rarely is:
        // half the value of a reading is knowing where it stopped.
        report.note === undefined
          ? ''
          : `
      <p class="caution run">${escape(report.note)}</p>`
      }${earlierReadings(report)}
      </details>`;
}

/**
 * The readings this district's report stands in front of.
 *
 * Each is rendered as the report it is, folded, rather than reduced to a line:
 * the question "what did it say then" is answered by the same table that
 * answers "what does it say now", and a second way of showing a reading is a
 * second thing to keep true.
 *
 * No Taksit/Kira column on them. That ratio is worked out from the cheapest
 * real rate in the record *today*, and putting last month's prices against this
 * month's rate produces a figure that was never true of any moment.
 */
function earlierReadings(report: ResearchReport): string {
  const earlier = report.earlier ?? [];
  if (earlier.length === 0) return '';

  return `
      <details class="earlier-readings">
      <summary>${foldSummary(earlier.map((reading) => ({ corrected: reading.corrected === true })))}</summary>${earlier
        .map((reading) => reportSection(reading))
        .join('')}
      </details>`;
}

/**
 * Sending the agent out.
 *
 * The button queues a request; the Claude Code session watching that queue picks
 * it up and runs the agent. Deliberately not "the server runs it": the work
 * stays where it can be watched, corrected and stopped, and where its cost is
 * visible. The copy says so, because a button that appears to do nothing is
 * worse than no button.
 */
const DISPATCH = `
      <div class="dispatch">
        <div class="ask">
          <label>İl<input id="province" type="text" value="İzmir" autocomplete="off"></label>
          <label>İlçe<input id="district" type="text" value="Çiğli" autocomplete="off"></label>
          <button type="button" id="ask-market">Bu ilçeyi araştır</button>
        </div>
        <button type="button" id="ask-rates">Banka oranlarını güncelle</button>
        <p class="note" id="ask-status">Açık olan Claude Code oturumu isteği alır ve agent’ı çalıştırır — ne yaptığını orada görürsün.</p>
      </div>`;

const RATES_EMPTY =
  'Henüz banka oranı yok. rate-scout agent’ını gönderip bankaları araştırdığında güncel konut kredisi oranları buraya gelir ve tıklayınca hesaba aktarılır.';

/** A monthly rate, as banks quote it — already a percentage, not a fraction. */
function ratePercent(value: number): string {
  return `%${value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * What the offer really costs, or why that cannot be said.
 *
 * The dash is the point. Most of these are package rates whose insurance cost
 * the bank does not publish, so the real cost is unknown *and higher* — and
 * repeating the quoted rate here would present the very number this column
 * exists to correct as though it were the correction.
 */
function trueRateCell(offer: RateOffer): string {
  const real = trueMonthlyRate(offer);
  if (real === undefined) {
    return `<td class="num true-rate unknown" title="Banka örnek ödeme planı yayınlamamış — gerçek maliyet bundan yüksek">—</td>`;
  }

  const worse = real > offer.monthly_rate + 0.005;
  return `<td class="num true-rate${worse ? ' worse' : ''}" title="Yıllık maliyet ${percent(annualCostRate(real))}">${ratePercent(real)}</td>`;
}

function bankCell(report: RateReport): string {
  const kind = report.kind === 'kar_payi' ? '<span class="tag">kâr payı</span>' : '';
  const href = externalHref(report.source_url);
  const name = escape(report.bank);

  // Linked to the page the figures were read from, not the bank's home page:
  // the next question after "who is cheapest" is always "let me see it", and a
  // rate you cannot go and check is a rate you have to take on trust.
  return href === undefined
    ? `<td>${name} ${kind}</td>`
    : `<td><a href="${href}" target="_blank" rel="noreferrer noopener">${name}</a> ${kind}</td>`;
}

/**
 * The product, with its conditions folded away behind it.
 *
 * The conditions matter — a package rate that requires four insurance products
 * is a different offer, and the difference is the whole comparison. But they run
 * to fifteen lines for some banks, and printed in full they swallowed the table
 * that exists to answer one question. So the product name leads and the rest is
 * one click behind a native <details>, which needs no script and stays
 * searchable in the page.
 *
 * No conditions, no triangle: an empty disclosure invites a click that reveals
 * nothing.
 */
function termsCell(offer: RateOffer): string {
  const product = escape(offer.product);
  if (offer.conditions === undefined || offer.conditions.trim().length === 0) {
    return `<td class="terms">${product}</td>`;
  }

  return `<td class="terms">
              <details>
                <summary>${product}</summary>
                <p>${escape(offer.conditions)}</p>
              </details>
            </td>`;
}

/**
 * Which way this bank has gone since an earlier reading.
 *
 * The two figures on their own leave the reader subtracting, and the question
 * being asked is not "what were the numbers" but "did borrowing here get
 * cheaper". Measured on the real cost, because the headline and the real cost
 * move independently and a series built on the headline reports movements
 * nobody paid.
 *
 * Nothing at all when either reading cannot be measured — not even "değişmedi",
 * which claims it held steady when nobody knows. The dash beside it already
 * says the cost is unknown.
 */
function sinceThen(movement: Movement | undefined): string {
  if (movement === undefined) return '';

  const points = Math.abs(movement.points);
  // Anything that would print as 0,00 — the two decimals shown below are the
  // boundary. A difference that small is rounding in a published example, not
  // a rate move, and "0,00 puan pahalı" is a movement claimed out of nothing.
  if (points < 0.005) return ` <span class="steady">değişmedi</span>`;

  // Which series it is, where it is not one product's own price. The best of
  // one reading against the best of another moves when a cheaper product
  // appears and nothing was repriced.
  const which =
    movement.basis === 'bank' ? ` <span class="steady">(en ucuz ürün değişti)</span>` : '';

  return ` <span class="moved">${points.toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} puan ${movement.points > 0 ? 'pahalı' : 'ucuz'}</span>${which}`;
}

function foldSummary(earlier: { corrected: boolean }[]): string {
  // A correction is not an earlier reading of the rate. Counting the two
  // together says the rate was once something else, and for a correction it
  // never was — the reading was wrong, the price never moved.
  const corrections = earlier.filter((reading) => reading.corrected).length;
  const readings = earlier.length - corrections;

  return [
    readings === 0 ? '' : `${readings} eski okuma`,
    corrections === 0 ? '' : `${corrections} düzeltme`,
  ]
    .filter((part) => part !== '')
    .join(', ');
}

/**
 * The readings this bank's row stands in front of.
 *
 * Its own row rather than something folded into a cell, because the cell it
 * would belong in is the one the table sorts by date — and a cell holding four
 * dates cannot also be a date. Folded by default: eight of fifteen banks have
 * history, and unfolding all of it doubles the table to answer a question
 * nobody asked yet.
 *
 * Both figures for each reading, because the headline alone cannot answer "did
 * it get dearer": the two move independently, which is the reason this record
 * exists at all.
 */
function historyRow(report: ShownRateReport): string {
  if (report.earlier.length === 0) return '';

  const readings = report.earlier
    .map((reading) => {
      const when = `<time datetime="${reading.report.captured_on}">${turkishDate(
        reading.report.captured_on,
      )}</time>`;

      // A correction is not a rate that moved, so it gets no figures at all —
      // printing them beside a genuine reading invents a movement out of a
      // mistake, and one of the record's corrections exists only because a bank
      // name was spelled with a dotless ı.
      //
      // "Yerine yenisi yazıldı", not "bu okuma yanlıştı". `supersedes` says one
      // file replaced another and nothing more; one correction says in its own
      // note that it does not correct the earlier reading but completes it. The
      // scout's account is in the fold, and the line above it should not claim
      // to summarise what it has not read.
      if (reading.corrected) {
        const why =
          reading.replacementNote === undefined
            ? ''
            : `<details class="why"><summary>yeni okumanın notu</summary><p>${escape(reading.replacementNote)}</p></details>`;
        return `<li class="corrected">${when} yerine yenisi yazıldı${why}</li>`;
      }

      // The offer the movement was measured on, not this reading's own
      // cheapest. Where the bank still sells the product it leads with today,
      // that is the product being followed — and printing a different one
      // beside the figure is the fault that had the table ranking a bank by one
      // product and showing another.
      const movement = moved(report, reading.report);
      const offer =
        movement?.product === undefined
          ? bestOffer(reading.report)
          : reading.report.offers.find((o) => o.product === movement.product);
      if (offer === undefined) return `<li>${when} oran yayınlamamış</li>`;

      const real = trueMonthlyRate(offer);
      return `<li>${when} ${ratePercent(offer.monthly_rate)} → ${
        real === undefined ? '—' : ratePercent(real)
      }${sinceThen(movement)}</li>`;
    })
    .join('');

  return `
          <tr class="history">
            <td colspan="5"><details>
              <summary>${foldSummary(report.earlier)}</summary>
              <ul>${readings}</ul>
            </details></td>
          </tr>`;
}

function rateRow(report: RateReport): string {
  // The record's own answer, not a second one computed here. This sorted on the
  // headline while the list around it sorted on the real cost, so a bank could
  // be ranked by one offer and printed as another — and where the printed offer
  // had no example, the table sorted it as measured and showed a dash.
  const cheapest = bestOffer(report);

  if (!cheapest) {
    // Kept in the table on purpose: a bank that publishes nothing is a different
    // answer from a bank nobody checked, and only one of them is worth retrying.
    return `
          <tr class="silent">
            ${bankCell(report)}
            <td class="num">—</td>
            <td class="num true-rate unknown">—</td>
            <td class="terms">Oran yayınlamıyor</td>
            <td class="when">${turkishDate(report.captured_on)}</td>
          </tr>`;
  }

  const gates = gatedOn(cheapest);

  return `
          <tr${gates.length === 0 ? '' : ` data-gate="${gates.join(' ')}"`}>
            ${bankCell(report)}
            <td class="num"><button type="button" class="use-rate"
              data-rate="${cheapest.monthly_rate}">${ratePercent(cheapest.monthly_rate)}</button></td>
            ${trueRateCell(cheapest)}
            ${termsCell(cheapest)}
            <td class="when">${turkishDate(report.captured_on)}</td>
          </tr>`;
}

/**
 * Savings finance, in a list of its own.
 *
 * Not a loan and not comparable as one: there is no rate, the money arrives
 * when a queue reaches you rather than at signing, and what decides whether it
 * is a good deal is the organisation fee and the wait. In the rates table it is
 * a row of blanks, which reads as data somebody failed to collect rather than
 * as a different instrument altogether.
 *
 * The comparison a buyer actually makes is between the two lists — thirty-six
 * months of waiting and no interest, against borrowing today at %2,97 real — so
 * both are on the page, one under the other, without either being forced into
 * the other's columns.
 */
function savingsTable(reports: SavingsFinanceReport[]): string {
  if (reports.length === 0) {
    return `
      <p class="note">Tasarruf finansmanına <strong>henüz bakılmadı</strong>. Faizsizdir ve
      oranı yoktur; parayı sıra sana geldiğinde verirler. Pahalı mı ucuz mu olduğunu
      organizasyon ücreti ile teslimat süresi belirler — ikisi de yukarıdaki tabloda
      olmayan şeyler.</p>`;
  }

  const rows = reports.flatMap((report) => {
    // Kept in the table on purpose, the same way a bank that publishes no rate
    // is. The schema keeps `plans: []` because a firm that offers nothing today
    // is not a firm nobody looked at, and only one of those means somebody
    // should go back — dropped from the list the two become one answer.
    //
    // One cell per heading rather than a colspan across the empty ones: the
    // sort script indexes row.cells by the heading's position, and cells counts
    // DOM nodes, not the columns a colspan covers. A short row would sort by
    // whatever landed at that index — its date, under the Teslimat heading.
    if (report.plans.length === 0) {
      return [
        `
          <tr class="silent">
            <td>${escape(report.provider)}</td>
            <td class="terms">Plan yayınlamıyor</td>
            <td class="num">—</td>
            <td class="num">—</td>
            <td class="num">—</td>
            <td class="when">${turkishDate(report.captured_on)}</td>
          </tr>`,
      ];
    }

    return report.plans.map((plan) => {
      const cost = planCost(plan);
      return `
          <tr>
            <td>${escape(report.provider)}</td>
            <td class="terms">${escape(plan.product)}</td>
            <td class="num">${String(plan.delivery_after_months)} ay${
              // A date the firm does not owe you is the difference between a
              // plan and a hope, and it is the one thing a rate table has no
              // column for.
              plan.delivery_basis === 'contractual'
                ? ' <span class="steady">(sözleşmeli)</span>'
                : ' <span class="caution">(beklenen)</span>'
            }</td>
            <td class="num">${cost.feeRatio === undefined ? '—' : percent(cost.feeRatio)}</td>
            <td class="num">${percent(cost.costRatio)}</td>
            <td class="when">${turkishDate(report.captured_on)}</td>
          </tr>`;
    });
  });

  return `
      <div class="scroller">
      <table class="savings">
        <thead>
          <tr>
            ${th(`Şirket`)}${th(`Plan`)}${th(`Teslimat`, 'num')}${th(`Organizasyon`, 'num')}${th(
              `Toplam maliyet${hint(
                'Firmanın kendi “toplam ödenecek tutar”ından çıkarılıyor: aldığın paranın üstüne ödediğinin oranı. ' +
                  'Bankadaki faizle aynı şey değil — bu bir yıllık oran değil, bütün planın toplamı. ' +
                  'Karşılaştırmak için banka tarafında da toplam faize bakman gerekir, aylık orana değil.',
              )}`,
              'num',
            )}${th(`Okundu`, 'when')}
          </tr>
        </thead>
        <tbody>${rows.join('')}
        </tbody>
      </table>
      </div>
      <p class="caveat">
        Bunlar kredi değil. Faiz yok, ama <strong>parayı imzada değil sıra sana geldiğinde</strong>
        alırsın — teslimat süresi ürünün kendisidir. “Beklenen” yazan bir tarih firmanın sana borçlu
        olduğu bir tarih değildir. Toplam maliyet oranı bütün planın toplamıdır; yukarıdaki aylık
        oranlarla doğrudan kıyaslanmaz.
      </p>`;
}

function ratesTable(reports: ShownRateReport[]): string {
  if (reports.length === 0) return `<p class="empty">${RATES_EMPTY}</p>`;

  return `
      <div class="scroller">
      <table class="rates">
        <thead>
          <tr>
            ${th(`Banka`)}${th(`Söylenen`, 'num')}${th(`Gerçek`, 'num')}${th(`Ürün`)}${th(`Okundu`, 'when')}
          </tr>
        </thead>
        <tbody>${reports.map((report) => rateRow(report) + historyRow(report)).join('')}
        </tbody>
      </table>
      </div>
      <p class="note">Orana tıklayınca hesaba geçer. Oranlar sık değişir — okunma tarihine bak.</p>
      <p class="caveat">
        Sıralama <strong>gerçek maliyete göre</strong> — söylenen orana göre değil.
        <strong>Gerçek</strong> sütunu bankanın kendi örnek ödeme planından hesaplanır:
        peşin alınan faiz ve dosya masrafı eline geçen parayı düşürür, taksit aynı kalır,
        yani ödediğin oran söylenenden yüksektir. Aradaki fark bu tablonun var olma sebebi.${
          headlineMisleads(reports)
            ? ` Şu anki kayıtta en düşük manşet oran, gerçekte listenin en pahalı teklifi.`
            : ''
        }
        <strong>—</strong> olan bankalar en altta, çünkü örnek yayınlamamışlar; gerçek
        maliyetleri <em>bilinmiyor</em> ve söylenenden düşük olmadığı kesin — bilinmeyen bir
        sayı ölçülmüş olanların üstüne oturmamalı. Paket oranı sigorta ve ek ürün almayı
        şart koşar, değişken oran başlangıç değeridir.
      </p>`;
}

/**
 * Asked once, above everything it affects.
 *
 * These two answers decide which of the rates below the reader can actually
 * get: existing ownership closes every "İlk Evim" rate outright, removes the
 * KKDF/BSMV exemption and cuts the loan-to-value ratio to a quarter; age
 * shortens the term, which raises the instalment. Asking underneath the table —
 * where the ownership question used to live — means reading a comparison that
 * only half applies to you.
 *
 * The ownership question names the household, not the reader, because every
 * bank defines it that way: "kendisi, eşi veya 18 yaşından küçük çocukları".
 * Anyone whose spouse owns the flat answers "no" to a question about themselves
 * and gets a comparison built on a rate they cannot have.
 */
const HOUSEHOLD = `
      <form id="household" class="household" autocomplete="off">
        <label><span class="q">Yaşın${hint('Bankalar son taksitin 70 yaşından önce bitmesini ister, o yüzden yaş vadeyi kısaltır — 62 yaşında 120 ay değil 96 ay çıkar. Bu bir kanun değil, bankaların uyguladığı kendi sınırı: BDDK yaş sınırını ve azami vadeyi her bankaya bırakıyor.')}</span><span class="control"><input id="age" type="text" inputmode="numeric" value="35"><span class="unit">yaş</span></span></label>
        <label><span class="q">Sen, eşin veya 18 yaş altı çocuğun üzerine kayıtlı konut${hint('Bankaların hepsi “ilk ev”i hane olarak tanımlıyor: kendisi, eşi veya 18 yaşından küçük çocukları. Varsa üç şey birden değişir — “İlk Evim” oranlarının hiçbirini alamazsın, taksitlere %15 BSMV eklenir (konut kredisi muafiyeti kalkar) ve kullanabileceğin kredi oranı %75 azalır (BDDK 10656). Bu, kurallardaki tek en büyük etki.')}</span><select id="ownsHome">
          <option value="no" selected>Yok</option>
          <option value="yes">Var</option>
        </select></label>
        <label><span class="q">Yeni evli misin${hint(
          'Kayıttaki en ucuz gerçek maliyet yeni evlilere özel bir üründe — Halkbank’ın “Yeni Evlilere Özel Konut Kredisi”, söylenen %2,60, gerçekte %2,72. Koşulu bankanın kendi cümlesiyle tabloda duruyor; evlilik tarihi sorulmuyor ve hiçbir yere yazılmıyor, çünkü uygunluğu banka değerlendirir, bu sayfa değil. “Evet” dersen bu ürünler tabloda solmaz; “Hayır” dersen alamayacağın bir oran listenin başında oturmaz.',
        )}</span><select id="newlywed">
          <option value="no" selected>Hayır</option>
          <option value="yes">Evet — eşlerden biri 35 yaşını doldurmamış, nikâh 3 yıldan eski değil</option>
        </select></label>
        <label><span class="q">Hanede maaşı kim alıyor${hint('Bu bir filtre değil, bir hatırlatma. Ziraat, Halkbank ve VakıfBank’ın üçünde de kamu/maaş koşullu konut oranı ARANDI ve hiçbiri yayınlamıyor — ama üçünün de kendi belgeleri böyle bir oranın var olduğunu söylüyor. Ziraat’in broşürü: “kurumunuz ile Bankamız arasında imzalanan maaş protokolüne göre değişiklik gösterebilir… şubemiz ile irtibata geçiniz.” Ziraat’in kendi hesaplama servisinde maaşlı/maaşsız oran alanı var, konut için ikisi de sıfır dönüyor. VakıfBank’ın OYAK ve TSK üyelerine özel konut kampanyaları canlı ama oran yazmıyor. Yani aşağıdaki tablo herkese açık oranlar; protokol oranı sormadan öğrenilmiyor.')}</span><select id="salary">
          <option value="private" selected>Özel sektör / serbest</option>
          <option value="public">Kamu (memur, öğretmen, sağlık, TSK, OYAK)</option>
          <option value="retired">Emekli</option>
        </select></label>
      </form>
      <p class="note advice" id="salaryNote"></p>`;

const FINANCE_FORM = `
      <form id="finance" autocomplete="off">
        <div class="fields">
          <label>Aylık ödeyebileceğin<input id="budget" type="text" inputmode="decimal" value="60.000"><span>₺</span></label>
          <label>Peşinat<input id="downPayment" type="text" inputmode="decimal" value="1.000.000"><span>₺</span></label>
          <label>Baktığın ev fiyatı<input id="price" type="text" inputmode="decimal" value="3.500.000"><span>₺</span></label>
          <label>Aylık faiz<input id="rate" type="text" inputmode="decimal" value="2,79"><span>%</span></label>
          <label>Vade<input id="months" type="text" inputmode="numeric" value="120"><span>ay</span><span class="cap" id="termCap"></span></label>
          <label>Enerji sınıfı${hint('Kredi oranı BDDK’nın 29.01.2026 tarihli 11364 sayılı kararıyla enerji sınıfına bağlandı — A/B bir eve, aynı fiyatta D sınıfı bir evden %20 puan daha fazla kredi çıkıyor. Bilmiyorsan “D ve altı”nda bırak: yanlış tarafa düşmek, olmayan bir krediyi varmış gibi göstermekten iyidir.')}<select id="energyClass">
            <option value="A_B">A veya B</option>
            <option value="C">C</option>
            <option value="OTHER" selected>D ve altı / bilinmiyor</option>
          </select></label>
        </div>
      </form>

      <div class="answers">
        <section class="answer">
          <h4>Bu bütçeyle en fazla</h4>
          <p class="big" id="maxPrice">—</p>
          <p class="note" id="maxPriceNote"></p>
        </section>
        <section class="answer">
          <h4>Baktığın ev için aylık</h4>
          <p class="big" id="payment">—</p>
          <p class="note" id="paymentNote"></p>
        </section>
      </div>

      <dl class="breakdown" id="breakdown"></dl>

      <p class="caveat">
        Üzerine kayıtlı bir ev varsa kredi oranı <strong>%75 azaltılır</strong> (BDDK 10656) —
        eş ve 18 yaş altı çocuklar dahil. Kredi oranı satış fiyatına değil <strong>ekspertiz
        değerine</strong> uygulanır ve ekspertiz
        çoğu zaman istenen fiyatın altında çıkar — gerçekte çekebileceğin kredi buradakinden düşük
        olabilir. Konut kredisinde <strong>BSMV yoktur</strong> (5582 sayılı kanun) ve KKDF de
        uygulanmaz (88/12944 sayılı BKK — bu ikincisini birincil kaynaktan doğrulayamadık),
        o yüzden hesaba vergi eklenmez. Ama <strong>üzerine kayıtlı ev varsa BSMV eklenebilir</strong>
        (bankalar böyle uyguluyor) — bu durumda gerçek maliyet buradakinden yüksek. İhtiyaç
        kredisinde muafiyet zaten yok. Vade için
        <strong>yasal bir üst sınır yoktur</strong> — 120 ay bankaların yaygın uygulaması. Sigorta, ekspertiz ve
        ipotek masrafları dahil değildir.
      </p>`;

function recordRow(record: SeerRecord): string {
  return `
          <tr>
            <td>${escape(record.seer)}</td>
            <td class="num">${record.brier.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td class="num">${percent(record.predicted)}</td>
            <td class="num">${percent(record.observed)}</td>
            <td class="num">${tl(record.count)}</td>
          </tr>`;
}

function recordTable(records: SeerRecord[]): string {
  return `
      <table>
        <thead>
          <tr>
            ${th(`Agent`)}
            ${th(`Brier`, 'num')}
            ${th(`Dediği`, 'num')}
            ${th(`Olan`, 'num')}
            ${th(`Ölçülen`, 'num')}
          </tr>
        </thead>
        <tbody>${records.map(recordRow).join('')}
        </tbody>
      </table>`;
}

function instrumentTable(returns: InstrumentReturn[]): string {
  return `
      <table>
        <thead>
          <tr>${th(`Araç`)}${th(`Yıllık getiri`, 'num')}${th(`Kaynak`, 'src')}</tr>
        </thead>
        <tbody>${returns
          .map(
            (entry) => `
          <tr>
            <td>${escape(entry.name)}</td>
            <td class="num">${percent(entry.annual_return)}</td>
            <td class="src">${escape(entry.source)}</td>
          </tr>`,
          )
          .join('')}
        </tbody>
      </table>`;
}

function panelBody(tab: Tab, data: PageData): string {
  const empty = `<p class="empty">${escape(tab.emptyState)}</p>`;

  if (tab.id === 'housing') {
    // Computed here because it needs both halves: the report has the prices and
    // the rate record has what borrowing costs. Neither knows the other, which
    // is exactly why the brief tells a scout not to work it out.
    const cheapest = cheapestRealRate(data.rates);

    // Which reading is the newest, rather than which sorts first. The loader
    // orders by place name — every reading in the record shares a date today,
    // so `index === 0` looked right and was the alphabetically first district.
    // Ties keep the loader's order, so the list stays stable.
    const newest = data.research.reduce(
      (best, report, index) => (report.dated > (data.research[best]?.dated ?? '') ? index : best),
      0,
    );

    const research =
      data.research.length === 0
        ? empty
        : data.research
            .map((report, index) => {
              // Built fresh per report rather than mutated in place: sharing one
              // object across the loop is correct only for as long as nothing
              // here becomes asynchronous, which is not a property worth
              // depending on for a table of numbers.
              const cost =
                cheapest === undefined
                  ? undefined
                  : {
                      monthlyRate: cheapest.rate,
                      bank: cheapest.bank,
                      byName: new Map(
                        owningVsRenting(data.finance.rules, report.neighbourhoods, {
                          ...ASSUMED,
                          monthlyRate: cheapest.rate,
                        }).map((ranked) => [ranked.name, ranked.timesRent]),
                      ),
                    };

              return reportSection(report, cost, index === newest);
            })
            .join('');

    // Two halves, because they are two different sessions of thinking: what is
    // this place worth, and what can I reach. Together they were twenty-eight
    // neighbourhoods and fifteen banks on one screen, which is not a page.
    //
    // The banks stay with the calculator rather than with the research, even
    // though a rate looks like a finding. It is a button that feeds the
    // calculator, and separating them would undo the reason they were put side
    // by side.
    //
    // Inside the second half the DOM order is the phone's order — who you are,
    // the banks, the calculator — and the wide layout rearranges by grid
    // coordinate rather than by moving anything, so a phone gets that order
    // untouched. The banks come before the calculator because a reader who
    // meets the calculator first fills in the default and never finds out the
    // table is clickable.
    return `
      <div class="subtabs" role="tablist" aria-label="Konut">
        <button role="tab" id="tab-pazar" data-tab="pazar" aria-controls="panel-pazar"
                aria-selected="true" tabindex="0">Pazar araştırması</button>
        <button role="tab" id="tab-finansman" data-tab="finansman" aria-controls="panel-finansman"
                aria-selected="false" tabindex="-1">Finansman</button>
      </div>

      <section role="tabpanel" id="panel-pazar" aria-labelledby="tab-pazar">
        <section class="research">
          ${DISPATCH}
          ${research}
        </section>
      </section>

      <section role="tabpanel" id="panel-finansman" aria-labelledby="tab-finansman" hidden>
        <div class="split">
          <section class="who">
            <h3 class="section">Durumun</h3>
            ${HOUSEHOLD}
          </section>

          <section class="evidence">
            <h3 class="section">Banka oranları</h3>
            ${ratesTable(data.rates)}
            <h3 class="section">Tasarruf finansmanı</h3>
            ${savingsTable(data.savings)}
          </section>

          <section class="money">
            <h3 class="section">Finansman</h3>
            ${FINANCE_FORM}
          </section>
        </div>
      </section>`;
  }

  if (tab.id === 'sicil') {
    // No number at all when nothing has been measured: zero is the best possible
    // Brier score and an unmeasured agent must not appear to have earned it.
    return data.records.length === 0 ? empty : recordTable(data.records);
  }

  const returns = data.instruments.filter((entry) => entry.module === tab.id);
  return returns.length === 0 ? empty : instrumentTable(returns);
}

/**
 * The calculator, running against the same compiled module the tests run
 * against. Nothing here posts, stores or persists what is typed: amounts are
 * personal data, and this page is generated from a public repository.
 */
const FINANCE_SCRIPT = `
  const rules = window.__MOPSOS_RULES__;
  const M = window.Mortgage;
  const $ = (id) => document.getElementById(id);
  // Reading and writing numbers comes from the compiled module rather than from
  // hand-written lines in this string. That is where the last silent bug came
  // from: one backslash too few left /./g in the page, a regex matching every
  // character, and every field quietly read as zero.
  const money = M.formatTry;
  const num = M.parseTurkishNumber;

  function run() {
    const budget = num($('budget').value);
    const downPayment = num($('downPayment').value);
    const price = num($('price').value);
    const rate = num($('rate').value);
    const months = Math.round(num($('months').value));
    const energyClass = $('energyClass').value;
    const ownsHome = $('ownsHome').value === 'yes';
    const age = Math.round(num($('age').value));

    const fail = (message) => {
      // Cleared here rather than at each site: the term cap is about age, and
      // leaving it up beside a failure that is not about age reads as a reason
      // for that failure.
      $('termCap').textContent = '';
      $('maxPrice').textContent = '—';
      $('payment').textContent = '—';
      $('maxPriceNote').textContent = '';
      $('paymentNote').textContent = message;
      $('breakdown').innerHTML = '';
    };

    if ([budget, downPayment, price, rate].some(Number.isNaN) || Number.isNaN(months)) {
      return fail('Sayıları kontrol et.');
    }

    // Checked here rather than by catching the module's error: that error is
    // written for whoever reads the code, and this interface is Turkish. The
    // number still comes from the pinned rules, so there is one source for it.
    if (months < 1) return fail('Vade en az 1 ay olmalı.');
    if (months > rules.term.conventional_max_months) {
      return fail('Bankalar konut kredisinde genelde en fazla ' +
        rules.term.conventional_max_months + ' ay veriyor. Yasal bir üst sınır yok.');
    }

    // The age limit shortens the term silently, so it is said out loud. Shown as
    // what banks do, never as law: the pinned rules record in as many words that
    // no regulation sets either an age limit or a maximum maturity here.
    if (Number.isNaN(age) || age < 18 || age > 100) {
      return fail('Yaşını kontrol et.');
    }

    const allowed = M.maxTermForAge(rules, age);
    if (allowed === 0) {
      return fail(age + ' yaşında bankaların uyguladığı ' +
        rules.term.conventional_max_age_at_final_instalment +
        ' yaş sınırı nedeniyle konut kredisi vadesi çıkmıyor.');
    }

    $('termCap').textContent = allowed < rules.term.conventional_max_months
      ? 'yaşın nedeniyle en fazla ' + allowed
      : '';

    if (months > allowed) {
      return fail(age + ' yaşında en fazla ' + allowed + ' ay çıkar — bankalar son taksitin ' +
        rules.term.conventional_max_age_at_final_instalment +
        ' yaşından önce bitmesini ister. Yasal bir sınır değil, banka uygulaması.');
    }

    try {
      const reachable = M.affordability({ rules, monthlyBudget: budget, downPayment,
        monthlyRatePercent: rate, months, energyClass, ownsHome });
      $('maxPrice').textContent = money(reachable);
      $('maxPriceNote').textContent = reachable <= downPayment
        ? 'Bu bütçe krediyi çevirmiyor; ancak peşinatın kadarına bakabilirsin.'
        : 'Peşinat ' + money(downPayment) + ' + kredi ' + money(reachable - downPayment);
    } catch (error) {
      $('maxPrice').textContent = '—';
      $('maxPriceNote').textContent = error.problems ? error.problems.join(' ') : error.message;
    }

    const ratio = M.maxLoanToValue(rules, price, energyClass, { ownsHome });
    const cap = M.maxLoan(rules, price, energyClass, { ownsHome });
    const wanted = price - downPayment;
    const loan = Math.max(0, Math.min(wanted, cap));

    if (loan <= 0) {
      $('payment').textContent = money(0);
      $('paymentNote').textContent = 'Peşinat fiyatı zaten karşılıyor.';
      $('breakdown').innerHTML = '';
      return;
    }

    const payment = M.monthlyPayment(loan, rate, months);
    $('payment').textContent = money(payment);
    $('paymentNote').textContent = wanted > cap
      ? 'Bu fiyat ve enerji sınıfında kredi en fazla ' + money(cap) + '. En az ' +
        money(M.minDownPayment(rules, price, energyClass, { ownsHome })) + ' peşinat gerekiyor.'
      : (payment > budget ? 'Aylık bütçenin üzerinde.' : 'Aylık bütçenin içinde.');

    const rows = [
      ['Kredi', money(loan)],
      ['Kredi / değer oranı', '%' + (ratio * 100).toLocaleString('tr-TR') +
        (ownsHome ? ' (mevcut ev nedeniyle dörtte bire indi)' : '')],
      ['Toplam geri ödeme', money(M.totalRepayment(loan, rate, months))],
      ['Toplam faiz', money(M.totalInterest(loan, rate, months))],
    ];
    $('breakdown').innerHTML = rows
      .map(([term, value]) => '<dt>' + term + '</dt><dd>' + value + '</dd>')
      .join('');
  }

  // Sorting, on every table at once.
  //
  // Delegated from the document rather than bound per heading: the tables are
  // rendered as strings and a listener per a th would have to be re-attached
  // every time one of them is rebuilt. The comparator lives in the same bundle
  // as the mortgage arithmetic, so the order a test proves is the order shown.
  const sortTable = (table, index, direction) => {
    const body = table.tBodies[0];
    if (!body) return;

    // A bank's folded readings live in a row of their own, and sorting the rows
    // independently would leave them under whichever bank landed above — one
    // bank's history attributed to another. Paired up first, moved together.
    const rows = [...body.rows].filter((row) => !row.classList.contains('history'));
    const folded = new Map(rows.map((row) => {
      const next = row.nextElementSibling;
      return [row, next && next.classList.contains('history') ? next : null];
    }));

    rows.sort((a, b) =>
      M.compareCells(
        (a.cells[index] || {}).textContent || '',
        (b.cells[index] || {}).textContent || '',
        direction,
      ),
    );
    for (const row of rows) {
      body.appendChild(row);
      const under = folded.get(row);
      if (under) body.appendChild(under);
    }
  };

  const activate = (heading) => {
    const table = heading.closest('table');
    const row = heading.parentElement;
    if (!table || !row) return;

    const index = [...row.cells].indexOf(heading);
    // Third click is not a third state: back to ascending, because "unsorted"
    // is not a thing the reader can see once the rows have moved.
    const direction = heading.getAttribute('aria-sort') === 'ascending' ? -1 : 1;

    for (const other of table.querySelectorAll('th')) other.setAttribute('aria-sort', 'none');
    heading.setAttribute('aria-sort', direction === 1 ? 'ascending' : 'descending');

    sortTable(table, index, direction);
  };

  document.addEventListener('click', (event) => {
    // The question mark inside a heading is its own control. Without this, asking what a
    // column means also reorders the table under you.
    if (event.target.closest('.hint')) return;

    const heading = event.target.closest('th.sortable');
    if (heading) activate(heading);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;

    const heading = event.target.closest && event.target.closest('th.sortable');
    if (!heading) return;

    event.preventDefault();
    activate(heading);
  });

  for (const button of document.querySelectorAll('.use-rate')) {
    button.addEventListener('click', () => {
      const rate = $('rate');
      rate.value = String(button.dataset.rate).replace('.', ',');
      run();

      // The table is fifteen banks long, so the calculator it feeds is usually
      // off-screen. Without this the click looks like it did nothing at all.
      // Focus as well as scroll: the field that just changed is the one to look
      // at, and focus is what a keyboard or a screen reader follows.
      rate.scrollIntoView({ behavior: 'smooth', block: 'center' });
      rate.focus({ preventScroll: true });
      rate.select();
    });
  }

  $('finance').addEventListener('input', run);
  // Not a filter: there is nothing in the record to filter by, because no bank
  // publishes one. It is the one answer whose useful output is an instruction.
  const salaryNote = $('salaryNote');
  const salaryAdvice = {
    public: 'Kamu maaşı: bankalar kurumunla imzaladıkları maaş protokolüne bağlı oranları ' +
      'yayınlamıyor. Ziraat, Halkbank ve VakıfBank’ın üçünde de arandı, hiçbirinde yok — ama ' +
      'üçü de böyle bir oranın var olduğunu kendi belgelerinde söylüyor. Aşağıdaki tablo ' +
      'herkese açık oranlar; eşinin kurumu üzerinden daha iyisi çıkabilir. Şubeye sormadan ' +
      'öğrenilmiyor. VakıfBank’ın OYAK ve TSK üyelerine özel konut kampanyaları da oransız.',
    retired: 'Emekli maaşı: promosyon var (SGK protokolüyle 5.000–12.000 TL), ama incelenen ' +
      'bankalarda emekliye özel bir konut kredisi oranı yayınlanmıyor. Emekli sayfaları ' +
      'yalnızca taksit esnekliği veriyor.',
  };

  // Empty means gone — see .advice:empty in the stylesheet. Setting the hidden
  // attribute here instead would put that word into the panel's own markup,
  // where the tab machinery already uses it to mean something else.
  const showSalaryAdvice = () => {
    salaryNote.textContent = salaryAdvice[$('salary').value] || '';
  };
  $('household').addEventListener('change', showSalaryAdvice);
  showSalaryAdvice();

  // Dimmed, never hidden. A rate that exists and is out of reach is worth
  // knowing about — it is the difference between "there is nothing cheaper"
  // and "the cheapest thing is not for you" — and removing the row would make
  // the record look smaller than it is.
  const showWhatIsOpen = () => {
    const newlywed = $('newlywed').value === 'yes';
    for (const row of document.querySelectorAll('tr[data-gate]')) {
      row.classList.toggle('shut', row.getAttribute('data-gate') === 'newlywed' && !newlywed);
    }
  };
  $('household').addEventListener('change', showWhatIsOpen);
  showWhatIsOpen();

  // The household answers feed the same calculation, so they trigger it too.
  $('household').addEventListener('input', run);
  $('household').addEventListener('change', run);
  run();

  // Only the place is ever sent. The calculator's amounts are personal data and
  // stay in this page.
  const buttons = [$('ask-rates'), $('ask-market')];

  // The button disables itself while the request is in flight, and the status
  // line keeps the spinner until the page is reloaded. An agent run takes
  // minutes, so a state that clears itself after the POST returns would say
  // "done" while the work has barely started — and a button that looks idle
  // gets pressed again, which is how six scouts once went out for one job.
  const ask = async (payload, label) => {
    const status = $('ask-status');
    status.className = 'note working';
    status.textContent = label + ' isteniyor…';
    for (const button of buttons) button.disabled = true;

    try {
      const response = await fetch('/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (response.ok) {
        status.className = 'note working';
        status.textContent = label + ' sıraya alındı — Claude Code oturumunda çalışıyor. ' +
          'Terminale bak; bitince bu sayfayı tazele.';
        // Left disabled on purpose: the run is still going.
        return;
      }

      status.className = 'note failed';
      status.textContent = data.error || 'İstek gönderilemedi.';
    } catch {
      status.className = 'note failed';
      status.textContent = 'Sunucuya ulaşılamadı. npm run dev çalışıyor mu?';
    }

    for (const button of buttons) button.disabled = false;
  };

  $('ask-rates').addEventListener('click', () => ask({ kind: 'rates' }, 'Banka oranları'));
  $('ask-market').addEventListener('click', () =>
    ask({ kind: 'market', province: $('province').value, district: $('district').value },
      $('province').value + ' / ' + $('district').value));
`;

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

  /* A table too wide for the screen scrolls inside itself. The alternative is
     the page scrolling sideways, which takes the headings with it. */
  .scroller { overflow-x: auto; }

  /* Wide screens only. Below this the page is exactly what it was: one column,
     one order, nothing to reflow on a phone. */
  @media (min-width: 78rem) {
    .wrap { max-width: 76rem; }
    .split { display: grid; grid-template-columns: minmax(22rem, 27rem) 1fr; gap: 0 3rem;
      align-items: start; }
    /* Placed by coordinate, so the source order — and therefore the phone's
       order — is untouched by this rearrangement. */
    .who { grid-column: 1; grid-row: 1; }
    .money { grid-column: 1; grid-row: 2; }
    .evidence { grid-column: 2; grid-row: 1 / span 2; }
    /* The answer stays put while the fields above it are being changed. */
    .money .answers { position: sticky; top: 1.5rem; background: var(--ground);
      padding-bottom: .6rem; z-index: 2; }
    .money .fields { grid-template-columns: 1fr 1fr; }
    .who .household { grid-template-columns: 1fr; }
    .evidence .rates td.terms { max-width: 26rem; }
  }
  header { display: flex; align-items: baseline; gap: 1rem; flex-wrap: wrap; }
  .brand { font-family: var(--serif); font-size: 1.25rem; letter-spacing: .04em; margin: 0; }
  /* One level in from the report it belongs to, and quieter: what a district
     looked like last week is context for today's table, not a rival to it. */
  .earlier-readings { margin: 1rem 0 0; }
  .earlier-readings > summary { font-size: .8rem; color: var(--muted); cursor: pointer; }
  .earlier-readings .report { margin-left: 1rem; }
  /* On the reading, not only in the count above it: opened, it shows figures
     that were wrong, and the table itself does not say so. */
  .was-replaced { margin-left: .6rem; font-size: .75rem; color: var(--muted); }
  /* Folded readings sit under the bank they belong to and stay quieter than it:
     what a rate was last week is context for today's figure, not a rival to it. */
  .history td { padding-top: 0; border-top: 0; }
  .history summary { font-size: .8rem; color: var(--muted); cursor: pointer; }
  .history ul { margin: .4rem 0 .2rem; padding-left: 1.1rem; font-size: .85rem; }
  .history li { margin: .15rem 0; }
  .history .corrected { color: var(--muted); }
  /* Dimmed rather than removed: the reader should see that a cheaper rate
     exists and why it is not theirs. */
  .shut { opacity: .45; }
  /* Its own list, and it has to look like one: a second table under the first
     rather than more rows of the same thing. */
  table.savings { margin-top: .4rem; }
  /* Inline in the cell, but keeping the italic and the pending colour: a date
     the firm does not owe you should read differently at a glance. */
  .savings .caution { display: inline; margin: 0; font-size: .8rem; }
  /* The answer to the question the two figures raise, so it carries a little
     more weight than the figures themselves. */
  .moved { font-weight: 600; }
  .steady, .moved { font-size: .8rem; }
  .steady { color: var(--muted); }
  /* The reason a reading was retired is a scout's working note and can run to
     two thousand characters. Reachable, not inlined. */
  .why { display: inline; margin-left: .4rem; }
  .why summary { display: inline; font-size: .8rem; text-decoration: underline dotted; }
  .why p { margin: .3rem 0 .5rem; max-width: 62ch; }
  /* Beside the name on a wide screen, under it on a narrow one, and quiet in
     both: a caveat on the whole page rather than a heading of its own. */
  .freshness { margin: 0; font-size: .8rem; color: var(--muted); }
  .freshness time { color: var(--ink); }
  .brand small { display: block; font-family: var(--sans); font-size: .7rem; letter-spacing: .16em;
    text-transform: uppercase; color: var(--muted); font-weight: 600; }
  /* The inner strip is quieter than the outer one: it chooses a half of one
     tab, not which investment you are looking at. */
  .subtabs { margin: 2rem 0 0; border-bottom: 1px solid var(--line); }
  .subtabs [role="tab"] { font-size: .78rem; padding-bottom: .6rem; }
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
  h3.section { font-family: var(--sans); font-size: .72rem; letter-spacing: .18em;
    text-transform: uppercase; color: var(--ink); font-weight: 600; display: block;
    margin: 3.5rem 0 1.4rem; padding-bottom: .6rem; border-bottom: 1px solid var(--line); }
  [role="tabpanel"] > h3.section:first-child { margin-top: 0; }
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
  .fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
    gap: 1.1rem 1.5rem; margin-bottom: 2.5rem; }
  .fields label { display: grid; grid-template-columns: 1fr auto; gap: .3rem .5rem;
    font-size: .7rem; letter-spacing: .1em; text-transform: uppercase; color: var(--muted);
    font-weight: 600; align-items: center; }
  .fields input, .fields select { grid-column: 1; font: inherit; font-family: var(--serif);
    font-size: 1.15rem; text-transform: none; letter-spacing: 0; color: var(--ink);
    background: var(--surface); border: 1px solid var(--line); border-radius: 2px;
    padding: .45rem .6rem; width: 100%; }
  .fields select { font-size: .95rem; }
  .fields input:focus-visible, .fields select:focus-visible { outline: 2px solid var(--measured);
    outline-offset: 1px; }
  .fields span { grid-column: 2; grid-row: 2; font-family: var(--serif); font-size: 1rem;
    text-transform: none; letter-spacing: 0; }
  .answers { display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
    gap: 2rem; padding-top: 2rem; border-top: 1px solid var(--line); }
  .answer h4 { margin: 0 0 .4rem; font-size: .7rem; letter-spacing: .16em; text-transform: uppercase;
    color: var(--muted); font-weight: 600; }
  .big { font-family: var(--serif); font-size: 2.4rem; line-height: 1.1; margin: 0;
    color: var(--measured); font-variant-numeric: oldstyle-nums; }
  .note { font-size: .82rem; color: var(--muted); margin: .5rem 0 0; }
  .breakdown { display: grid; grid-template-columns: 1fr auto; gap: .55rem 2rem; margin: 2.5rem 0 0;
    padding-top: 1.5rem; border-top: 1px solid var(--line); font-size: .9rem; }
  .dispatch { margin-bottom: 2.5rem; }
  .ask { display: flex; gap: .75rem; align-items: flex-end; flex-wrap: wrap; margin-bottom: .75rem; }
  .ask label { display: grid; gap: .3rem; font-size: .7rem; letter-spacing: .1em;
    text-transform: uppercase; color: var(--muted); font-weight: 600; }
  .ask input { font: inherit; font-family: var(--serif); font-size: 1rem; text-transform: none;
    letter-spacing: 0; color: var(--ink); background: var(--surface);
    border: 1px solid var(--line); border-radius: 2px; padding: .4rem .6rem; width: 10rem; }
  .dispatch button { font: inherit; font-size: .8rem; letter-spacing: .04em; cursor: pointer;
    background: var(--measured); color: var(--surface); border: 0; border-radius: 2px;
    padding: .5rem 1rem; }
  .dispatch button:hover { background: var(--ink); }
  .dispatch button:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
  #ask-rates { background: none; color: var(--measured); border: 1px solid var(--line); }
  #ask-rates:hover { background: var(--surface); color: var(--ink); }
  .use-rate { font: inherit; font-family: var(--serif); font-size: 1rem; background: none;
    border: 0; border-bottom: 1px dashed var(--measured); color: var(--measured);
    cursor: pointer; padding: 0; font-variant-numeric: tabular-nums; }
  .use-rate:hover { border-bottom-style: solid; }
  .use-rate:focus-visible { outline: 2px solid var(--measured); outline-offset: 2px; }
  tr.silent td { color: var(--muted); }
  /* Conditions are long because they matter — a package rate with four insurance
     products attached is a different offer. Given room to breathe, not hidden. */
  .rates td.terms { font-size: .88rem; line-height: 1.5; max-width: 30rem; white-space: normal; }
  /* A folded reading: place, when, and how much is inside — enough to decide
     whether to open it. */
  .report { border-top: 1px solid var(--line); }
  .report > summary { cursor: pointer; padding: .9rem 0; display: flex; flex-wrap: wrap;
    align-items: baseline; gap: .8rem; font-size: 1rem; }
  .report > summary::marker { color: var(--muted); }
  .report[open] > summary { border-bottom: 1px solid var(--line); margin-bottom: 1.2rem; }
  .report .how-many { font-size: .78rem; color: var(--muted); }
  .report .dated { font-size: .78rem; color: var(--muted); letter-spacing: .04em; }
  .rates summary { cursor: pointer; color: var(--ink); }
  .rates summary::marker { color: var(--muted); }
  .rates details[open] summary { margin-bottom: .5rem; }
  .rates details p { margin: 0; font-size: .8rem; line-height: 1.6; color: var(--muted); }
  .rates td:first-child { white-space: normal; min-width: 7rem; }
  .rates td:first-child a { color: inherit; text-decoration: none;
    border-bottom: 1px solid var(--line); }
  .rates td:first-child a:hover { border-bottom-color: var(--ink); }
  /* The published rate and the real one sit side by side so the gap is the thing
     you see first. Grey where it is unknown, marked where it is worse. */
  .true-rate { font-family: var(--serif); font-variant-numeric: tabular-nums; }
  .true-rate.worse { color: var(--pending); font-weight: 600; }
  .true-rate.unknown { color: var(--muted); cursor: help; }

  /* The caret is the quick read; aria-sort is the one a screen reader gets. */
  th.sortable { cursor: pointer; user-select: none; }
  th.sortable:hover { color: var(--ink); }
  th.sortable:focus-visible { outline: 2px solid var(--measured); outline-offset: 2px; }
  th.sortable::after { content: '↕'; margin-left: .35rem; opacity: .28; font-size: .8em; }
  th[aria-sort='ascending']::after { content: '↑'; opacity: 1; color: var(--measured); }
  th[aria-sort='descending']::after { content: '↓'; opacity: 1; color: var(--measured); }

  /* Asked once, above everything it changes. */
  /* Same grid as the calculator below it: the label sits above its control, so a
     long question wraps into its own column instead of shoving the control sideways. */
  .household { display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
    gap: 1.2rem 2rem; align-items: start;
    padding: 1.2rem 1.4rem; background: var(--surface); border-left: 2px solid var(--measured); }
  .household label { display: flex; flex-direction: column; align-items: start; gap: .5rem; }
  /* The question and its ? are one line of text, so they share a span — as flex
     items the question mark would drop onto a row of its own. */
  .household .q { font-size: .7rem; letter-spacing: .1em; text-transform: uppercase;
    color: var(--muted); font-weight: 600; line-height: 1.6; }
  .household .control { display: flex; align-items: baseline; gap: .5rem; }
  .household .unit { font-size: .8rem; color: var(--muted); }
  .household input, .household select { font: inherit; font-family: var(--serif);
    font-size: 1rem; letter-spacing: 0; text-transform: none; color: var(--ink);
    background: var(--ground); border: 1px solid var(--line); padding: .45rem .6rem;
    width: 100%; max-width: 22rem; }
  .household #age { max-width: 6rem; }
  .household input:focus-visible, .household select:focus-visible {
    outline: 2px solid var(--measured); outline-offset: 1px; }
  .cap { color: var(--pending); font-size: .78rem; }
  /* What a figure does not tell you, kept beside the figure. */
  .caution { display: block; margin-top: .3rem; color: var(--pending); font-style: italic; }
  /* Marked out, because it is the one thing on the page that is not measured. */
  .reading { margin: 1.4rem 0 0; padding: 1.1rem 1.3rem; background: var(--surface);
    border-left: 2px solid var(--measured); }
  .reading h4 { margin: 0 0 .5rem; font-size: .7rem; letter-spacing: .1em;
    text-transform: uppercase; color: var(--muted); }
  .reading p { margin: 0; line-height: 1.7; }
  .reading .disclaimer { margin-top: .7rem; font-size: .78rem; color: var(--muted);
    font-style: italic; }
  .caution.run { margin: .9rem 0 0; padding-left: .8rem; border-left: 2px solid var(--pending);
    font-size: .82rem; line-height: 1.6; }
  .advice { flex-basis: 100%; margin: .9rem 0 0; padding: .8rem 1rem; background: var(--surface);
    border-left: 2px solid var(--pending); font-size: .82rem; line-height: 1.6; }
  .advice:empty { display: none; }

  /* A button, not a title= — a hover-only tooltip never appears on a phone,
     which is where a question mark gets tapped. */
  .hint { position: relative; display: inline-flex; align-items: center; justify-content: center;
    width: 1.05rem; height: 1.05rem; margin-left: .35rem; padding: 0; vertical-align: middle;
    font: inherit; font-size: .68rem; line-height: 1; color: var(--muted);
    background: none; border: 1px solid var(--line); border-radius: 50%; cursor: help; }
  .hint:hover, .hint:focus-visible { color: var(--ground); background: var(--ink);
    border-color: var(--ink); }
  .hint:focus-visible { outline: 2px solid var(--measured); outline-offset: 2px; }
  /* Downwards. Upwards clips against the top of the viewport whenever the
     control is near it, and a tooltip you have to scroll to is not a tooltip. */
  /* display:none rather than visibility:hidden. A hidden-but-laid-out tooltip
     still occupies space, and a 328px one anchored near the right edge pushed
     the whole document wider than a phone screen while invisible. */
  .hint-body { display: none; position: absolute; left: 0; top: calc(100% + .5rem); z-index: 5;
    width: max-content; max-width: min(26rem, 78vw); padding: .7rem .85rem;
    font-size: .78rem; line-height: 1.55; text-align: left; letter-spacing: 0;
    color: var(--ink); background: var(--surface); border: 1px solid var(--line);
    box-shadow: 0 6px 22px rgb(0 0 0 / 14%); }
  .hint:hover .hint-body, .hint:focus-visible .hint-body { display: block; }
  /* Near the right edge the tooltip would run off the page. */
  .rates .hint-body, .household label:last-child .hint-body { left: auto; right: 0; }

  /* An agent run takes minutes; the spinner stays until the page is reloaded. */
  .note.working::before { content: ''; display: inline-block; width: .62rem; height: .62rem;
    margin-right: .5rem; vertical-align: baseline; border: 2px solid var(--line);
    border-top-color: var(--measured); border-radius: 50%; animation: spin .8s linear infinite; }
  .note.working { color: var(--ink); }
  .note.failed { color: var(--pending); }
  @keyframes spin { to { transform: rotate(360deg); } }
  .dispatch button:disabled { opacity: .5; cursor: progress; }
  @media (prefers-reduced-motion: reduce) {
    .note.working::before { animation: none; border-top-color: var(--line); }
  }
  .breakdown dt { color: var(--muted); }
  .breakdown dd { margin: 0; text-align: right; font-family: var(--serif); font-size: 1.05rem;
    font-variant-numeric: tabular-nums; }
  .caveat { margin: 2.5rem 0 0; padding: 1.1rem 1.3rem; background: var(--surface);
    border-left: 2px solid var(--pending); font-size: .85rem; color: var(--muted); }
  .caveat strong { color: var(--ink); font-weight: 600; }
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
  // Wired per strip rather than once for the page. The housing tab has a strip
  // of its own, and one handler over every [role=tab] would make choosing
  // Finansman also switch which investment you are looking at.
  for (const strip of document.querySelectorAll('[role="tablist"]')) {
    const tabs = [...strip.querySelectorAll('[role="tab"]')];
    const outermost = strip === document.querySelector('[role="tablist"]');

    const select = (id) => {
      for (const tab of tabs) {
        const chosen = tab.dataset.tab === id;
        tab.setAttribute('aria-selected', String(chosen));
        tab.tabIndex = chosen ? 0 : -1;
        document.getElementById('panel-' + tab.dataset.tab).hidden = !chosen;
      }
      // Only the outer strip owns the address bar. Two writers would leave the
      // hash naming whichever was clicked last, which reloads to the wrong pair.
      if (outermost) history.replaceState(null, '', '#' + id);
    };

    for (const tab of tabs) tab.addEventListener('click', () => select(tab.dataset.tab));

    strip.addEventListener('keydown', (event) => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
      if (!step) return;
      const current = tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true');
      const next = tabs[(current + step + tabs.length) % tabs.length];
      next.focus();
      select(next.dataset.tab);
    });

    if (outermost && location.hash) {
      const wanted = location.hash.slice(1);
      if (tabs.some((tab) => tab.dataset.tab === wanted)) select(wanted);
    }
  }
`;

/**
 * The page's hand-written scripts, in the order they run.
 *
 * Exported so a test can compile them. Pulling them back out of the rendered
 * HTML with a regex was the obvious alternative and the wrong one: matching
 * tags by pattern misses the forms HTML actually allows — `</script >` is legal
 * and a naive pattern skips it — and there is no reason to re-derive something
 * we are holding.
 */
/**
 * Says how long ago each date on the page was, at the moment it is read.
 *
 * Deliberately coarse: days, not hours. Two readings taken hours apart are not
 * a direction, and an age precise to the minute invites reading one into them.
 */
const SINCE_SCRIPT = `
  document.querySelectorAll('[data-since]').forEach(function (el) {
    var on = el.getAttribute('data-since').split('-');
    var then = new Date(+on[0], +on[1] - 1, +on[2]);
    var today = new Date();
    var days = Math.round(
      (new Date(today.getFullYear(), today.getMonth(), today.getDate()) - then) / 86400000
    );
    if (days < 0) return;
    el.textContent += ' (' + (days === 0 ? 'bugün' : days === 1 ? 'dün' : days + ' gün önce') + ')';
  });
`;

export const PAGE_SCRIPTS: readonly string[] = [SCRIPT, FINANCE_SCRIPT, SINCE_SCRIPT];

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
      <section class="tabpanel" role="tabpanel" id="panel-${tab.id}" aria-labelledby="tab-${tab.id}"${
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
      <h1 class="brand">Mopsos<small>yatırım araştırması</small></h1>${freshness(data)}
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
  <script>${data.finance.bundle}</script>
  <script>window.__MOPSOS_RULES__ = ${JSON.stringify(data.finance.rules)};</script>
  ${PAGE_SCRIPTS.map((script) => `<script>${script}</script>`).join('')}
</body>
</html>
`;
}
