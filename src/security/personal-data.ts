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

  // (((x % 10) + 10) % 10), not (x % 10). JS `%` is a remainder and keeps the
  // sign of the dividend, so a negative intermediate yields a negative result
  // that never matches a digit — 19090909018 gives -29.  scan-ignore: example
  // Such an id would be silently accepted as "not a TCKN" and sail through,
  // which is the only kind of error that matters in a leak detector.
  if ((((odd * 7 - even) % 10) + 10) % 10 !== digits[9]) return false;

  const firstTen = digits.slice(0, 10).reduce((total, digit) => total + digit, 0);
  return firstTen % 10 === digits[10];
}

/** Put this on a line that must quote what the scanner forbids. */
const EXAMPLE_MARKER = 'scan-ignore: example';

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
  // Three rules rather than one long alternation, so each stays readable and
  // under the complexity limit. All three fire only when an amount is tied to
  // the author: a bare amount is market data, which is the entire point of this
  // repository, and flagging it would get the check disabled within a week.
  //
  // Turkish marks possession with a suffix rather than a separate word, so
  // "birikimim" and "param" carry the same meaning as "my savings" with nothing
  // to match on before the amount. Both orderings are covered.
  {
    kind: 'personal_amount',
    pattern:
      /\b(?:i have|my|benim|our)\b[^.\n]{0,60}?\d[\d.,]* ?(?:m|k|bin|milyon)? ?(?:TRY|TL|₺|USD|EUR)/gi,
  },
  {
    kind: 'personal_amount',
    // The `\w*` sits inside each alternative, not after the group: Turkish stems
    // take suffixes ("birikimim"), while "param" must not also match "parameter".
    pattern:
      /\b(?:savings|birikim\w*|portfolio|portföy\w*|tasarruf\w*|param|down payment|net worth)\b[^.\n]{0,60}?\d[\d.,]* ?(?:m|k|bin|milyon)? ?(?:TRY|TL|₺|USD|EUR)/gi,
  },
  {
    // Amount first, ownership word after: "2.4M TL birikimim".  scan-ignore: example
    kind: 'personal_amount',
    pattern:
      /\d[\d.,]* ?(?:m|k|bin|milyon)? ?(?:TRY|TL|₺|USD|EUR)\b[^.\n]{0,40}?\b(?:savings|birikim|tasarruf|portfolio|portföy|param|paran|net worth)\w*/gi,
  },
  {
    // The `No:` label is optional: Turkish addresses are as often written
    // "Gül Sokak 14/3" without one.  scan-ignore: example
    // The street keyword carries the signal; a district name on its own — the
    // intended content of this repository — has none.
    kind: 'address',
    pattern:
      /\b(?:mahalle(?:si)?|sokak|sok\.|cadde(?:si)?|cad\.|apt\.?|daire|blok)\b[^.\n]{0,40}?(?:\bno[:.\s]*)?\d+(?:\/\d+)?/gi,
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
    // Documentation and tests have to quote what they forbid. A line-scoped
    // marker keeps every exemption visible at the point of use and greppable,
    // rather than exempting a whole file forever in a list somewhere else.
    if (content.includes(EXAMPLE_MARKER)) return;

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
