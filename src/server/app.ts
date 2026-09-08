import { type IncomingMessage, type ServerResponse } from 'node:http';

import { writeHousehold } from '../record/household.js';
import { type PageData, renderPage, renderReading } from '../ui/render.js';

import { assertLocalRequest, assertSameOrigin, NotLocalError } from './guards.js';
import { findReading } from './reading.js';
import { appendRequest, InvalidRequestError, parseHousehold, parseRequest } from './requests.js';

/** Ample for {kind, province, district}, and small enough that nothing can pile up. */
const MAX_BODY_BYTES = 8 * 1024;

export interface ServerDeps {
  /** The private record. Everything written here goes into it. */
  dataDir: string;
  /**
   * Read late, because the Host check compares against it and a test binds to
   * whatever port is free.
   */
  port: () => number;
  /**
   * The record as it is right now.
   *
   * Called per request, so a report that lands while the server is running
   * shows up on a refresh rather than on a restart.
   */
  page: () => PageData;
  /**
   * Says a request was queued, where it will be acted on.
   *
   * Injected because the real one rings the terminal's bell and spawns a
   * window-manager call — neither of which belongs in a test run.
   */
  announce: () => void;
  log: (line: string) => void;
}

type Reply = ServerResponse;

const json = (response: Reply, status: number, body: unknown): void => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
};

const html = (response: Reply, body: string): void => {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(body);
};

/**
 * Collects a request body, then hands it to `act`.
 *
 * Both writing routes need the same three things — a size cap so nothing can
 * pile up, a refusal that is a refusal rather than a crash, and the guard — and
 * they had all three written out twice. The third copy is where they would have
 * started to differ.
 */
function withBody(
  request: IncomingMessage,
  response: Reply,
  port: number,
  act: (body: unknown) => void,
): void {
  try {
    assertLocalRequest(request.headers, port);
  } catch (error) {
    json(response, 403, { error: error instanceof NotLocalError ? error.message : 'Reddedildi' });
    return;
  }

  let collected = '';
  request.on('data', (chunk: Buffer) => {
    collected += chunk.toString('utf8');
    if (collected.length > MAX_BODY_BYTES) {
      json(response, 413, { error: 'İstek fazla büyük' });
      request.destroy();
    }
  });

  request.on('end', () => {
    if (response.writableEnded) return;
    try {
      act(JSON.parse(collected));
    } catch (error) {
      json(response, 400, {
        error: error instanceof InvalidRequestError ? error.message : 'İstek okunamadı',
      });
    }
  });
}

/**
 * Who the reader is, kept.
 *
 * Overwritten rather than appended: this is a current state, not an
 * observation. The record's append-only rule is about measurements, and nothing
 * here was measured.
 */
function saveHousehold(request: IncomingMessage, response: Reply, deps: ServerDeps): void {
  withBody(request, response, deps.port(), (body) => {
    writeHousehold(deps.dataDir, parseHousehold(body));
    response.writeHead(204);
    response.end();
  });
}

/** A research request, queued for the session watching the queue. */
function queueRequest(request: IncomingMessage, response: Reply, deps: ServerDeps): void {
  withBody(request, response, deps.port(), (body) => {
    const parsed = parseRequest(body);
    appendRequest(deps.dataDir, parsed, new Date().toISOString());
    deps.log(`\nMOPSOS_REQUEST ${JSON.stringify(parsed)}`);
    deps.announce();

    json(response, 202, { queued: true });
  });
}

/**
 * One reading, rendered by the same function that used to print it inline.
 *
 * The Host and Origin checks, not the JSON one: this reads, and a GET has no
 * body to be the cross-origin form post that check refuses. What still applies
 * is the rebinding door guards.ts describes, and this is the endpoint that
 * names files out of the private record.
 */
function serveReading(
  request: IncomingMessage,
  response: Reply,
  deps: ServerDeps,
  file: string | undefined,
): void {
  try {
    assertSameOrigin(request.headers, deps.port());
  } catch (error) {
    response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(error instanceof NotLocalError ? error.message : 'Reddedildi');
    return;
  }

  const data = deps.page();
  const found = findReading(data.research, file);

  if (found === undefined) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Böyle bir okuma yok');
    return;
  }

  html(response, renderReading(found, data));
}

/**
 * What the server does with a request.
 *
 * Separated from the process that runs it so it can be served on a socket in a
 * test. Every route here is a guard, a parser and a write to the reader's own
 * record, and all of it used to be verified by hand.
 *
 * Anything that is not a route gets the page. One page, one address: a path
 * that matches nothing is somebody's stale bookmark, and the page is what they
 * were looking for.
 */
export function routes(deps: ServerDeps) {
  return (request: IncomingMessage, response: Reply): void => {
    // The path, not a prefix of it: startsWith would claim /readings-summary
    // and anything else added later that happens to begin the same way.
    const asked = new URL(request.url ?? '/', `http://127.0.0.1:${String(deps.port())}`);
    const route = `${request.method ?? 'GET'} ${asked.pathname}`;

    if (route === 'POST /household') return saveHousehold(request, response, deps);
    if (route === 'POST /request') return queueRequest(request, response, deps);
    if (route === 'GET /reading') {
      return serveReading(request, response, deps, asked.searchParams.get('file') ?? undefined);
    }

    return html(response, renderPage(deps.page()));
  };
}
