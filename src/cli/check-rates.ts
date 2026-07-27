/**
 * Validates every rate report in the record and says what each one really costs.
 *
 * Written for whoever just wrote a report — a scout finishing a run, or a person
 * fixing one by hand. Three scouts once each invented their own field names for
 * `example`, and nothing said so until the interface refused to build hours
 * later, by which time the agent that could have fixed it was gone.
 *
 * It also reports the checksum: where a bank publishes its own yıllık maliyet
 * oranı and our arithmetic misses it, the example is short of a charge. That is
 * a finding about the reading, not about the bank, and it belongs in front of
 * the person who did the reading.
 *
 * Usage: npm run check:rates
 */
import { resolveDataDir } from '../config/data-dir.js';
import { annualCostRate } from '../finance/effective.js';
import { loadRateReports, trueMonthlyRate } from '../rates/load.js';

const reports = loadRateReports(resolveDataDir(process.cwd(), process.env));
let withExample = 0;
let unusable = 0;

for (const report of reports) {
  console.log(`\n${report.bank}  (${report.captured_on})`);

  for (const offer of report.offers) {
    const quoted = `%${offer.monthly_rate.toFixed(2)}`;

    if (offer.example === undefined) {
      console.log(`  ${quoted}  ${offer.product}  — örnek yok, gerçek maliyet bilinmiyor`);
      continue;
    }

    withExample += 1;
    const real = trueMonthlyRate(offer);

    if (real === undefined) {
      unusable += 1;
      const published = offer.example.published_annual_cost_rate;
      console.log(
        `  ${quoted}  ${offer.product}  — ÖRNEK EKSİK` +
          (published === undefined
            ? ''
            : `: bankanın yayınladığı %${published.toFixed(4)} yeniden üretilemiyor`),
      );
      continue;
    }

    console.log(
      `  ${quoted} -> %${real.toFixed(2)}  (yıllık %${(annualCostRate(real) * 100).toFixed(2)})` +
        `  ${offer.product}`,
    );
  }
}

console.log(
  `\n${String(reports.length)} banka, ${String(withExample)} örnek, ` +
    `${String(unusable)} tanesi eksik.`,
);

// Non-zero so a scout that runs this as its last step cannot miss the problem.
if (unusable > 0) process.exit(1);
