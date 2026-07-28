import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { launchAdvice, parsePageRequest } from './page-request.js';

describe('parsePageRequest', () => {
  it('takes a url and where to put what it reads', () => {
    const request = parsePageRequest(['https://www.akbank.com/konut', '/tmp/out'], '/tmp/out');

    expect(request.url).toBe('https://www.akbank.com/konut');
    expect(request.text).toBe(join('/tmp/out', 'page.txt'));
    expect(request.screenshot).toBe(join('/tmp/out', 'page.png'));
  });

  it('refuses a scheme that is not http', () => {
    // This runs whatever it is given, in a browser, on the user's machine. The
    // url arrives from an agent's own reasoning about a bank's website, and
    // file: would read the disk while javascript: would run whatever followed.
    expect(() => parsePageRequest(['file:///C:/Users/fahri/.ssh/id_rsa'], '/tmp/out')).toThrow(
      /http/i,
    );
    expect(() => parsePageRequest(['javascript:fetch("/x")'], '/tmp/out')).toThrow(/http/i);
  });

  it('refuses something that is not a url at all', () => {
    expect(() => parsePageRequest(['akbank.com'], '/tmp/out')).toThrow(/http/i);
  });

  it('says what it needs when given nothing', () => {
    expect(() => parsePageRequest([], '/tmp/out')).toThrow(/url/i);
  });

  it('waits longer when asked, within a bound', () => {
    // A rate table drawn by script can take a while. An unbounded wait turns a
    // blocked page into a hung run, which reads as "still working" forever.
    expect(parsePageRequest(['https://x.test', '/tmp/o', '20'], '/tmp/o').waitSeconds).toBe(20);
    expect(parsePageRequest(['https://x.test', '/tmp/o', '600'], '/tmp/o').waitSeconds).toBe(60);
    expect(parsePageRequest(['https://x.test'], '/tmp/o').waitSeconds).toBe(5);
  });
});

describe('launchAdvice', () => {
  it('turns a missing browser into the command that fixes it', () => {
    // The Playwright package and the browser binaries version separately, so a
    // machine with the MCP server's chromium still lacks this one's. A scout
    // hitting a stack trace here has no way to know that one line fixes it.
    const advice = launchAdvice(
      new Error("browserType.launch: Executable doesn't exist at /some/path/chrome.exe"),
    );

    expect(advice).toContain('npx playwright install chromium');
  });

  it('says nothing about anything else, rather than guessing', () => {
    expect(launchAdvice(new Error('net::ERR_CONNECTION_REFUSED'))).toBeUndefined();
  });
});
