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
    expect(() => parsePageRequest(['file:///home/someone/.ssh/id_rsa'], '/tmp/out')).toThrow(
      /http/i,
    );
    expect(() => parsePageRequest(['javascript:fetch("/x")'], '/tmp/out')).toThrow(/http/i);
  });

  it('refuses an address that only this machine can reach', () => {
    // The url comes from an agent reasoning about a bank's website, and this
    // opens it in a browser running here. A bank is on the public internet; a
    // link-local or loopback address is something only this machine can see,
    // and reaching one is never the job. 169.254.169.254 is the cloud metadata
    // service — credentials, on an unauthenticated http endpoint.
    for (const url of [
      'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
      'http://localhost:8787/',
      'http://127.0.0.1/',
      'http://[::1]/',
      'http://192.168.1.1/',
      'http://10.0.0.5/admin',
      'http://172.16.4.4/',
    ]) {
      expect(() => parsePageRequest([url], '/tmp/out'), url).toThrow(/public/i);
    }
  });

  it('lets an ordinary public address through', () => {
    for (const url of [
      'https://www.akbank.com/x',
      'http://172.32.0.1/',
      'https://93.184.216.34/',
    ]) {
      expect(() => parsePageRequest([url], '/tmp/out'), url).not.toThrow();
    }
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
    // English, like everything else outside the application UI: this is read by
    // an agent as often as by a person, and the agent-facing half of this
    // repository is English throughout.
    expect(advice).toMatch(/^[ -~]+$/);
  });

  it('says nothing about anything else, rather than guessing', () => {
    expect(launchAdvice(new Error('net::ERR_CONNECTION_REFUSED'))).toBeUndefined();
  });
});
