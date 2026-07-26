export type PersonalDataKind = 'national_id' | 'iban' | 'phone' | 'personal_amount' | 'address';

export interface PersonalDataFinding {
  kind: PersonalDataKind;
  /** 1-indexed, so the report points at something the reader can open. */
  line: number;
  match: string;
}

/**
 * Turkish national id checksum.
 *
 * Without it, any eleven-digit number trips the scanner — and this repository is
 * full of them: timestamps, series values, ids. A scanner that cries wolf gets
 * switched off, and then it protects nothing.
 */
export function isValidTckn(value: string): boolean {
  if (!/^[1-9]\d{10}$/.test(value)) return false;

  const digits = [...value].map(Number);
  const odd = digits[0]! + digits[2]! + digits[4]! + digits[6]! + digits[8]!;
  const even = digits[1]! + digits[3]! + digits[5]! + digits[7]!;

  if ((odd * 7 - even) % 10 !== digits[9]) return false;

  const firstTen = digits.slice(0, 10).reduce((total, digit) => total + digit, 0);
  return firstTen % 10 === digits[10];
}

interface Rule {
  kind: PersonalDataKind;
  pattern: RegExp;
  accept?: (match: string) => boolean;
}

const RULES: Rule[] = [
  {
    kind: 'national_id',
    pattern: /\b\d{11}\b/g,
    accept: isValidTckn,
  },
  {
    kind: 'iban',
    pattern: /\bTR\d{2}(?: ?\d{4}){5} ?\d{2}\b/gi,
  },
  {
    kind: 'phone',
    pattern: /(?:\+90 ?|\b0)(?:\d ?){10}\b/g,
  },
  // Split in two rather than one long alternation, so each stays readable. Both
  // fire only when an amount is tied to the author: a bare amount is market
  // data, which is the entire point of this repository, and flagging it would
  // get the check disabled within a week.
  {
    kind: 'personal_amount',
    pattern:
      /\b(?:i have|my|benim|our)\b[^.\n]{0,60}?\d[\d.,]* ?(?:m|k|bin|milyon)? ?(?:TRY|TL|₺|USD|EUR)/gi,
  },
  {
    kind: 'personal_amount',
    pattern:
      /\b(?:savings|birikim|portfolio|portföy|down payment|net worth)\b[^.\n]{0,60}?\d[\d.,]* ?(?:m|k|bin|milyon)? ?(?:TRY|TL|₺|USD|EUR)/gi,
  },
  {
    kind: 'address',
    pattern:
      /\b(?:mahalle(?:si)?|sokak|sok\.|cadde(?:si)?|cad\.|apt\.?|daire)\b[^.\n]{0,40}?\bno[:.\s]*\d+/gi,
  },
];

/**
 * Scans text for the author's own personal data.
 *
 * A different problem from secret scanning, which looks for credential formats
 * and cannot recognise a first-person amount as sensitive. On a public repository
 * the risk that matters is not a remote attacker — it is publishing your own
 * finances by accident, and once pushed it cannot be unpublished.
 *
 * Tuned to stay quiet on market data. A district name, a price per square metre
 * and a threshold inside a resolution rule are the intended contents of this
 * repository; a scanner that flags them is one that gets disabled.
 */
export function findPersonalData(text: string): PersonalDataFinding[] {
  const findings: PersonalDataFinding[] = [];
  // Two rules can match overlapping text on one line. Reporting it twice trains
  // the reader to skim the report, which is how a real hit gets missed.
  const seen = new Set<string>();

  text.split('\n').forEach((content, index) => {
    for (const rule of RULES) {
      for (const [match] of content.matchAll(rule.pattern)) {
        if (rule.accept && !rule.accept(match.replaceAll(' ', ''))) continue;

        const line = index + 1;
        const key = `${rule.kind}:${line}`;
        if (seen.has(key)) continue;
        seen.add(key);

        findings.push({ kind: rule.kind, line, match });
      }
    }
  });

  return findings;
}
