import { annualCostRate } from '../finance/effective.js';
import { type RateExample, trueMonthlyRate } from '../rates/load.js';

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

export interface RateOffer {
  product: string;
  monthly_rate: number;
  max_term_months?: number;
  conditions?: string;
  example?: RateExample;
}

export interface RateReport {
  bank: string;
  kind: 'faiz' | 'kar_payi';
  captured_on: string;
  source_url: string;
  offers: RateOffer[];
  note?: string;
}

export interface FinanceBundle {
  /** The compiled mortgage module, so the page and the tests share one implementation. */
  bundle: string;
  /** The pinned BDDK rules, applied identically in the browser. */
  rules: unknown;
}

export interface PageData {
  modules: TabModule[];
  research: ResearchReport[];
  instruments: InstrumentReturn[];
  records: SeerRecord[];
  rates: RateReport[];
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

function rateRow(report: RateReport): string {
  const cheapest = [...report.offers].sort((a, b) => a.monthly_rate - b.monthly_rate)[0];

  if (!cheapest) {
    // Kept in the table on purpose: a bank that publishes nothing is a different
    // answer from a bank nobody checked, and only one of them is worth retrying.
    return `
          <tr class="silent">
            ${bankCell(report)}
            <td class="num">—</td>
            <td class="num true-rate unknown">—</td>
            <td>Oran yayınlamıyor</td>
            <td class="when">${turkishDate(report.captured_on)}</td>
          </tr>`;
  }

  return `
          <tr>
            ${bankCell(report)}
            <td class="num"><button type="button" class="use-rate"
              data-rate="${cheapest.monthly_rate}">${ratePercent(cheapest.monthly_rate)}</button></td>
            ${trueRateCell(cheapest)}
            <td>${escape(cheapest.conditions ?? cheapest.product)}</td>
            <td class="when">${turkishDate(report.captured_on)}</td>
          </tr>`;
}

function ratesTable(reports: RateReport[]): string {
  if (reports.length === 0) return `<p class="empty">${RATES_EMPTY}</p>`;

  return `
      <table class="rates">
        <thead>
          <tr>
            <th>Banka</th><th class="num">Söylenen</th><th class="num">Gerçek</th><th>Koşul</th><th class="when">Okundu</th>
          </tr>
        </thead>
        <tbody>${reports.map(rateRow).join('')}
        </tbody>
      </table>
      <p class="note">Orana tıklayınca hesaba geçer. Oranlar sık değişir — okunma tarihine bak.</p>
      <p class="caveat">
        Sıralama <strong>yayınlanan aylık orana göre</strong>; “en ucuz” demek değil.
        <strong>Gerçek</strong> sütunu bankanın kendi örnek ödeme planından hesaplanır:
        peşin alınan faiz ve dosya masrafı eline geçen parayı düşürür, taksit aynı kalır —
        yani ödediğin oran söylenenden yüksektir. <strong>—</strong> ise banka örnek
        yayınlamamış demektir; o zaman gerçek maliyet <em>bilinmiyor</em> ve söylenenden
        düşük olmadığı kesin. Paket oranı sigorta ve ek ürün almayı şart koşar, değişken
        oran başlangıç değeridir.
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
            <th>Agent</th>
            <th class="num">Brier</th>
            <th class="num">Dediği</th>
            <th class="num">Olan</th>
            <th class="num">Ölçülen</th>
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
          <tr><th>Araç</th><th class="num">Yıllık getiri</th><th class="src">Kaynak</th></tr>
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
    const research = data.research.length === 0 ? empty : data.research.map(reportSection).join('');

    // Research first, then how to pay for what it found. That is the order the
    // decision is made in, so it is the order the panel is read in.
    return `
      <h3 class="section">Pazar araştırması</h3>
      ${DISPATCH}
      ${research}

      <h3 class="section">Durumun</h3>
      ${HOUSEHOLD}

      <h3 class="section">Banka oranları</h3>
      ${ratesTable(data.rates)}

      <h3 class="section">Finansman</h3>
      ${FINANCE_FORM}`;
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

  for (const button of document.querySelectorAll('.use-rate')) {
    button.addEventListener('click', () => {
      $('rate').value = String(button.dataset.rate).replace('.', ',');
      run();
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
  .rates td:nth-child(4) { font-size: .82rem; line-height: 1.5; color: var(--muted); }
  .rates td:first-child { white-space: normal; min-width: 7rem; }
  .rates td:first-child a { color: inherit; text-decoration: none;
    border-bottom: 1px solid var(--line); }
  .rates td:first-child a:hover { border-bottom-color: var(--ink); }
  /* The published rate and the real one sit side by side so the gap is the thing
     you see first. Grey where it is unknown, marked where it is worse. */
  .true-rate { font-family: var(--serif); font-variant-numeric: tabular-nums; }
  .true-rate.worse { color: var(--pending); font-weight: 600; }
  .true-rate.unknown { color: var(--muted); cursor: help; }

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
  .hint-body { position: absolute; left: 0; top: calc(100% + .5rem); z-index: 5;
    width: max-content; max-width: min(26rem, 78vw); padding: .7rem .85rem;
    font-size: .78rem; line-height: 1.55; text-align: left; letter-spacing: 0;
    color: var(--ink); background: var(--surface); border: 1px solid var(--line);
    box-shadow: 0 6px 22px rgb(0 0 0 / 14%); opacity: 0; visibility: hidden;
    transition: opacity .12s; }
  .hint:hover .hint-body, .hint:focus-visible .hint-body { opacity: 1; visibility: visible; }
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
 * The page's hand-written scripts, in the order they run.
 *
 * Exported so a test can compile them. Pulling them back out of the rendered
 * HTML with a regex was the obvious alternative and the wrong one: matching
 * tags by pattern misses the forms HTML actually allows — `</script >` is legal
 * and a naive pattern skips it — and there is no reason to re-derive something
 * we are holding.
 */
export const PAGE_SCRIPTS: readonly string[] = [SCRIPT, FINANCE_SCRIPT];

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
      <h1 class="brand">Mopsos<small>yatırım araştırması</small></h1>
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
