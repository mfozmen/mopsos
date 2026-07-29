import { describe, expect, it } from 'vitest';

import { findPersonalData, isValidTckn } from './personal-data.js';

function kinds(text: string): string[] {
  return findPersonalData(text).map((finding) => finding.kind);
}

describe('isValidTckn', () => {
  it('accepts a number satisfying the checksum', () => {
    expect(isValidTckn('10000000078')).toBe(true);
  });

  it('rejects eleven digits that merely look like one', () => {
    // Without the checksum, any 11-digit number trips the scanner — and this
    // repository is full of them: timestamps, series values, ids.
    expect(isValidTckn('12345678901')).toBe(false);
  });

  it('rejects a number starting with zero', () => {
    expect(isValidTckn('01234567890')).toBe(false);
  });

  it('accepts a valid number whose checksum step goes negative', () => {
    // For 19090909018 the intermediate is -29. JS % is a remainder, not a
    // modulo, so it yields -9 and the id is silently rejected — meaning a real
    // national id would sail through the scanner untouched. False negatives
    // here are the only kind that matter.
    expect(isValidTckn('19090909018')).toBe(true);
  });
});

describe('national id', () => {
  it('flags a valid TCKN', () => {
    expect(kinds('TCKN: 10000000078')).toEqual(['national_id']);
  });

  it('says nothing about an eleven-digit number that is not one', () => {
    expect(kinds('The reference is 12345678901.')).toEqual([]);
  });
});

describe('bank details', () => {
  it('flags a Turkish IBAN', () => {
    expect(kinds('TR330006100519786457841326')).toEqual(['iban']);
  });

  it('flags an IBAN written with spaces, as people actually write them', () => {
    expect(kinds('TR33 0006 1005 1978 6457 8413 26')).toEqual(['iban']);
  });
});

describe('phone numbers', () => {
  it.each(['+90 532 123 45 67', '05321234567'])('flags %s', (phone) => {
    expect(kinds(`Call ${phone}`)).toEqual(['phone']);
  });

  it('says nothing about a year or a series value', () => {
    expect(kinds('The 2026 figure was 41.5, up from 39.1.')).toEqual([]);
  });
});

describe("amounts claimed as the author's own", () => {
  it.each([
    'I have 2.4M TRY in savings',
    'my 2,400,000 TRY down payment',
    'benim 2.4M TL birikimim',
    'portfolio: 2400000 TRY',
  ])('flags %s', (text) => {
    expect(kinds(text)).toContain('personal_amount');
  });

  it('says nothing about market data, which is the whole point of the repository', () => {
    expect(
      kinds('The median listing price per m2 for 3+1 flats in Menemen is 45,000 TRY.'),
    ).toEqual([]);
  });

  it('says nothing about a threshold inside a resolution rule', () => {
    expect(kinds("rule: 'value > 41.5'")).toEqual([]);
  });
});

describe('addresses', () => {
  it('flags a street address with a building number', () => {
    expect(kinds('Atatürk Mahallesi, Gül Sokak No: 14/3')).toEqual(['address']);
  });

  it('says nothing about a district named as market geography', () => {
    expect(kinds('3+1 flats in Menemen, İzmir')).toEqual([]);
  });
});

describe('reporting', () => {
  it('reports where the problem is, not just that there is one', () => {
    const findings = findPersonalData('clean line\nTCKN 10000000078\nclean again');

    expect(findings[0]?.line).toBe(2);
  });

  it('reports every distinct problem', () => {
    expect(kinds('10000000078 and TR330006100519786457841326').sort()).toEqual([
      'iban',
      'national_id',
    ]);
  });
});

describe('Turkish possessive phrasing', () => {
  it.each(['2.4M TL birikimim var', 'param 2400000 TRY', 'toplam 2400000 TRY tasarrufum'])(
    'flags %s, where ownership is a suffix rather than a separate word',
    (text) => {
      expect(kinds(text)).toContain('personal_amount');
    },
  );

  it('flags an amount followed by the ownership word', () => {
    expect(kinds('2400000 TRY in savings')).toContain('personal_amount');
  });

  it('still says nothing about market data in the same shape', () => {
    expect(kinds('Sales in Menemen totalled 45,000 TRY per m2.')).toEqual([]);
  });
});

describe('addresses without a No: label', () => {
  it('flags a street and building number written the common way', () => {
    expect(kinds('Gül Sokak 14/3, Menemen')).toEqual(['address']);
  });
});

describe('deduplication', () => {
  it('reports one finding when two patterns match the same text', () => {
    // "my ... savings ... amount" satisfies both the first-person and the
    // portfolio rule. Two identical lines in a report train the reader to skim.
    expect(kinds('my savings are 2400000 TRY')).toEqual(['personal_amount']);
  });
});

describe('marked examples', () => {
  it('skips a line that declares itself an example', () => {
    // Documentation and tests have to quote what they forbid. A line-scoped
    // marker keeps each exemption visible where it is used, and greppable —
    // unlike a file-level list, which exempts a whole file forever.
    expect(kinds('TCKN 10000000078  scan-ignore: example')).toEqual([]);
  });

  it('still scans the rest of a file containing a marked line', () => {
    const text = 'TCKN 10000000078  scan-ignore: example\nTR330006100519786457841326';

    expect(kinds(text)).toEqual(['iban']);
  });
});

describe('a home directory names the person who owns it', () => {
  it('catches a Windows user path', () => {
    // This repository is public and the rule covers anything identifying, not
    // only money. A brief that ships with someone's home directory in it names
    // them to everyone who installs the plugin — and one had, on main.
    expect(findPersonalData(String.raw`from C:\Users\someone\source\mopsos`)).toHaveLength(1);
  });

  it('catches it whatever case it was typed in', () => {
    // A path gets pasted from a shell, a log, or a Windows dialog, and the case
    // is whatever it happened to be. Matching only the capitalised form leaves
    // the commonest paste form through.
    for (const path of [
      String.raw`C:\users\alice\src`,
      String.raw`c:\USERS\alice\src`,
      '/USERS/alice/x',
      '/Home/alice/x',
    ]) {
      expect(findPersonalData(path), path).toHaveLength(1);
    }
  });

  it('catches a path written the way a source file writes one', () => {
    // A Windows path inside a .ts or .js string is escaped: 'C:\Users\name'.
    // The scanner reads those files, and the leak that started all of this was
    // in one — a rule that only matches the single-backslash form misses the
    // exact case it exists for.
    expect(findPersonalData(String.raw`const p = 'C:\Users\alice\src';`)).toHaveLength(1);
    expect(findPersonalData(String.raw`"C:\\Users\\alice"`)).toHaveLength(1);
  });

  it('leaves a URL path alone, which is not a home directory', () => {
    // /users/ and /home/ are ordinary REST segments, and matching without case
    // made that worse. A repository full of source links cannot afford this one.
    for (const text of [
      'https://example.com/users/alice',
      'see https://api.test/home/alice/settings',
      'https://github.com/mfozmen/mopsos/blob/main/src/Users/x.ts',
    ]) {
      expect(findPersonalData(text), text).toEqual([]);
    }
  });

  it('catches a Unix home directory', () => {
    expect(findPersonalData('cd /home/someone/src && npm test')).toHaveLength(1);
    expect(findPersonalData('open /Users/someone/Documents')).toHaveLength(1);
  });

  it('leaves every exempted service account alone, all of them', () => {
    // Every name in the rule's exclusion list, not a sample. An untested
    // exemption is one nobody notices going wrong, and the cost of a wrong one
    // here is a check that cries wolf until it gets switched off.
    const exempt = [
      'runner', // GitHub Actions
      'ubuntu', // devcontainers and cloud images
      'vscode',
      'node',
      'admin',
      'administrator',
      'root', // only reachable as /home/root; bare /root never matches the rule
      'Public', // Windows' shared profiles
      'Default',
      'Default User',
      'All Users',
    ];

    for (const name of exempt) {
      for (const path of [`/home/${name}/x`, `/Users/${name}/x`, String.raw`C:\Users\${name}\x`]) {
        expect(findPersonalData(path), path).toEqual([]);
      }
    }
  });

  it('exempts a service account wherever the path stops', () => {
    // The exemption looked for a slash or the end of the string after the name,
    // so it held for /home/runner/x and not for "/home/runner." at the end of a
    // sentence. The scanner found this in its own source comment, which is the
    // check working on itself.
    for (const text of [
      'see /home/root, which some images use',
      'logs land in /home/runner.',
      'the /home/ubuntu; then',
      'path is /Users/vscode)',
    ]) {
      expect(findPersonalData(text), text).toEqual([]);
    }
  });

  it('leaves a path with no person in it alone', () => {
    // The signal is the user name, not the path. These are the paths this
    // repository is full of, and flagging them would get the check disabled.
    expect(findPersonalData('src/finance/mortgage.ts')).toEqual([]);
    expect(findPersonalData(String.raw`C:\Program Files\Google\Chrome`)).toEqual([]);
    expect(findPersonalData('/tmp/mopsos-page-abc/page.txt')).toEqual([]);
    expect(findPersonalData('~/.claude/settings.json')).toEqual([]);

describe('a size is not a house number', () => {
  it('does not read the 2 in m2 as a door number', () => {
    // "mahalle,m2,fiyat" is a CSV header. The pattern wants a street keyword
    // followed by a house number, and a digit glued to a letter is a unit.
    expect(findPersonalData('mahalle,m2,fiyat')).toEqual([]);
    expect(findPersonalData('daire,m2,fiyat')).toEqual([]);
  });

  it('still catches an address written the way Turkish addresses are', () => {
    // Loosened here would be worse than noisy: this repository is public and
    // the thing it must never carry is where the person lives.
    expect(findPersonalData('Gül Sokak 14/3')).toHaveLength(1);
    expect(findPersonalData('Egekent 2 Mahallesi 1234 Sokak No: 5')).toHaveLength(1);
    expect(findPersonalData('Atatürk Caddesi No:12 Daire 4')).toHaveLength(1);
  });
});
