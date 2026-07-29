/**
 * Turns listings collected by hand into a market report.
 *
 * sahibinden permits this in `robots.txt` and refuses it in practice: one
 * ordinary request to a district page comes back "Olağandışı bir durum tespit
 * ettik" with a support code. Being refused is a finding, and getting past a
 * refusal is somebody else's problem to have — but a browser a person is
 * sitting at is not refused, so the source comes in through them.
 *
 * Usage:
 *   npm run import:listings -- <file.csv> <il> <ilçe> "<ne ölçüldü>"
 *
 * The CSV wants a header and three columns: mahalle, m2, fiyat. Turkish
 * thousands separators are fine if the cell is quoted.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { resolveDataDir } from '../config/data-dir.js';
import { InvalidListingsError, listingsToReport } from '../market/import.js';
import { assertValid } from '../schema/validate.js';

const [file, province, district, source] = process.argv.slice(2);

if (
  file === undefined ||
  province === undefined ||
  district === undefined ||
  source === undefined
) {
  console.error(
    'Usage: npm run import:listings -- <file.csv> <province> <district> "<what was measured>"\n' +
      '\nThe last argument is the basket: site, room count, size band, date. It is what makes\n' +
      'the next reading comparable with this one, so it is not optional.',
  );
  process.exit(2);
}

if (!existsSync(file)) {
  console.error(`No such file: ${file}`);
  process.exit(1);
}

const capturedOn = new Date().toISOString().slice(0, 10);

let report;
try {
  report = listingsToReport(readFileSync(file, 'utf8'), {
    province,
    district,
    capturedOn,
    source,
  });
} catch (error) {
  if (error instanceof InvalidListingsError) {
    console.error(error.message);
    process.exit(3);
  }
  throw error;
}

const slug = (value: string) =>
  value
    .toLocaleLowerCase('tr')
    .replaceAll('ı', 'i')
    .replaceAll('ş', 's')
    .replaceAll('ğ', 'g')
    .replaceAll('ü', 'u')
    .replaceAll('ö', 'o')
    .replaceAll('ç', 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const dataDir = resolveDataDir(process.cwd(), process.env);
const directory = join(dataDir, 'market');
mkdirSync(directory, { recursive: true });

const path = join(directory, `${capturedOn}-${slug(province)}-${slug(district)}.json`);

// Validated before it is written, not after it is read.
//
// The loader refuses a malformed report by name — which is right, and which
// happens hours later, to whoever next opens the interface. Checking here means
// the person who made the file is the person who hears about it.
try {
  assertValid('market-report', report);
} catch (error) {
  console.error(
    `Not a valid market report: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(5);
}

// Never overwritten, and the exclusive flag rather than a check-then-write. A
// report is a dated observation; a second one on the same day is a correction,
// which the schema handles with `supersedes`. Checking first and writing after
// leaves a gap in which the file can appear, which is a small window and the
// wrong shape for something that must not be lost.
try {
  writeFileSync(path, JSON.stringify(report, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;

  console.error(
    [
      `${path} already exists.`,
      'A report is never overwritten. If this corrects it, rename the new file and add',
      '"captured_at" and "supersedes" by hand — the older reading stays on disk.',
    ].join('\n'),
  );
  process.exit(4);
}

console.log(`${path}`);
for (const n of report.neighbourhoods) {
  console.log(
    `  ${n.name.padEnd(22)} ${String(n.sale_per_m2).padStart(8)} ₺/m²  ` +
      `${String(n.listing_count).padStart(3)} ilan  ${n.confidence}`,
  );
}
console.log(
  `\n${String(report.neighbourhoods.length)} neighbourhood(s). Confidence is capped at ` +
    '"medium": high means cross-checked against a second source, and this is one.\n' +
    'Add a "reading" to the file by hand — what the figures mean is the half a table cannot say.',
);
