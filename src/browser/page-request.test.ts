import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { allowsRequestTo, launchAdvice, parsePageRequest } from './page-request.js';

describe('parsePageRequest', () => {
  it('takes a url and where to put what it reads', () => {
    const request = parsePageRequest(
      ['https://www.akbank.com/konut', '/tmp/out'],
      () => '/tmp/out',
    );

    expect(request.url).toBe('https://www.akbank.com/konut');
    expect(request.text).toBe(join('/tmp/out', 'page.txt'));
    expect(request.screenshot).toBe(join('/tmp/out', 'page.png'));
  });

  it('refuses a scheme that is not http', () => {
    // This runs whatever it is given, in a browser, on the user's machine. The
    // url arrives from an agent's own reasoning about a bank's website, and
    // file: would read the disk while javascript: would run whatever followed.
    expect(() => parsePageRequest(['file:///home/someone/.ssh/id_rsa'], () => '/tmp/out')).toThrow(
      /http/i,
    );
    expect(() => parsePageRequest(['javascript:fetch("/x")'], () => '/tmp/out')).toThrow(/http/i);
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
      // RFC 6598 shared address space. Alibaba Cloud's metadata endpoint is
      // 100.100.100.200, which is the same class of target as AWS's.
      'http://100.100.100.200/latest/meta-data/',
      'http://100.64.0.1/',
      'http://100.127.255.254/',
    ]) {
      expect(() => parsePageRequest([url], () => '/tmp/out'), url).toThrow(/public/i);
    }
  });

  it('sees through an IPv4 address wearing IPv6 clothes', () => {
    // new URL() rewrites ::ffff:169.254.169.254 as [::ffff:a9fe:a9fe], so a
    // check that reads the dotted form never sees it. Same metadata service,
    // same credentials, one notation away.
    for (const url of [
      'http://[::ffff:169.254.169.254]/latest/meta-data/',
      'http://[::ffff:127.0.0.1]/',
      'http://[0:0:0:0:0:ffff:7f00:1]/',
      'http://[::ffff:10.0.0.1]/',
      'http://[::]/',
    ]) {
      expect(() => parsePageRequest([url], () => '/tmp/out'), url).toThrow(/public/i);
    }
  });

  it('sees through a decimal or hexadecimal address too', () => {
    // These normalise to 127.0.0.1 before the check runs, which is the check
    // working rather than luck — but worth holding, because it is the kind of
    // thing a rewrite of the parsing would quietly lose.
    for (const url of ['http://2130706433/', 'http://0x7f000001/']) {
      expect(() => parsePageRequest([url], () => '/tmp/out'), url).toThrow(/public/i);
    }
  });

  it('lets an ordinary public address through', () => {
    for (const url of [
      'https://www.akbank.com/x',
      'http://172.32.0.1/',
      'https://93.184.216.34/',
    ]) {
      expect(() => parsePageRequest([url], () => '/tmp/out'), url).not.toThrow();
    }
  });

  it('refuses something that is not a url at all', () => {
    expect(() => parsePageRequest(['akbank.com'], () => '/tmp/out')).toThrow(/http/i);
  });

  it('says what it needs when given nothing', () => {
    expect(() => parsePageRequest([], () => '/tmp/out')).toThrow(/url/i);
  });

  it('never writes into the working directory by default', () => {
    // The working directory is the public repository. The scout briefs forbid
    // dropping working files there in as many words — after two runs left page
    // dumps in the root — and an optional argument defaulting to cwd builds the
    // same mistake into the tool. A screenshot of a bank page is exactly the
    // kind of thing that must not land in a commit by accident.
    const request = parsePageRequest(['https://example.test/x'], () => tmpdir());

    expect(request.text.startsWith(process.cwd())).toBe(false);
    expect(request.text.startsWith(tmpdir())).toBe(true);
  });

  it('does not make a directory it was not going to use', () => {
    // The default is only wanted when no directory was given. Building it every
    // time leaves an empty folder behind on every run that passed one.
    let made = 0;
    parsePageRequest(['https://example.test/x', '/tmp/given'], () => {
      made += 1;
      return tmpdir();
    });

    expect(made).toBe(0);
  });

  it('waits longer when asked, within a bound', () => {
    // A rate table drawn by script can take a while. An unbounded wait turns a
    // blocked page into a hung run, which reads as "still working" forever.
    expect(parsePageRequest(['https://x.test', '/tmp/o', '20'], () => '/tmp/o').waitSeconds).toBe(
      20,
    );
    expect(parsePageRequest(['https://x.test', '/tmp/o', '600'], () => '/tmp/o').waitSeconds).toBe(
      60,
    );
    expect(parsePageRequest(['https://x.test'], () => '/tmp/o').waitSeconds).toBe(5);
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

describe('allowsRequestTo', () => {
  it('stops a redirect landing somewhere the first check would have refused', () => {
    // The realistic way past the url check: a public domain the attacker already
    // controls, answering 302 to the metadata service. goto follows it without
    // asking, so every request gets checked rather than only the one typed.
    expect(allowsRequestTo('http://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(allowsRequestTo('http://[::ffff:127.0.0.1]/')).toBe(false);
    expect(allowsRequestTo('http://localhost:8787/')).toBe(false);
  });

  it('lets an ordinary page and its own assets load', () => {
    expect(allowsRequestTo('https://www.akbank.com/konut')).toBe(true);
    expect(allowsRequestTo('https://cdn.akbank.com/style.css')).toBe(true);
  });

  it('refuses anything it cannot read as a url', () => {
    expect(allowsRequestTo('not a url')).toBe(false);
  });
});
