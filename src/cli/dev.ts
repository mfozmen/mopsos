/**
 * The live page: builds it, serves it, answers it, and takes research requests.
 *
 * Requests are appended to a queue in the private data directory. Nothing here
 * runs an agent — the Claude Code session watching the queue does that, so the
 * work happens where you can see it, steer it, and stop it.
 *
 * It builds the page itself rather than reading a file somebody else wrote.
 * The two commands used to be a writer and a reader of ui/index.html, so a
 * fresh clone met a 404 telling it to go and run the other one — a step the
 * machine can take on its own and therefore a step nobody should have to.
 *
 * It also keeps the household answers. Four questions that decide which rates
 * the reader can actually get, retyped on every regeneration of the page until
 * they were given somewhere to live — the record, not the browser, because they
 * are a research input rather than interface state.
 *
 * It also answers for the readings. The page carries an index of what exists
 * and asks for one when a date is picked, because printing every reading into
 * the page was a quarter of it for three of them. The answer is rendered here
 * by the same function that used to print them inline: a second renderer would
 * drift, and the drift would be two tables of plausible numbers disagreeing.
 *
 * Usage: npm run dev
 */
import { spawn } from 'node:child_process';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { resolve } from 'node:path';

import { resolveDataDir } from '../config/data-dir.js';
import { raiseTerminal } from '../server/attention.js';
import { assertLocalRequest, assertSameOrigin, NotLocalError } from '../server/guards.js';
import { findReading } from '../server/reading.js';
import {
  appendRequest,
  InvalidRequestError,
  parseHousehold,
  parseRequest,
} from '../server/requests.js';
import { writeHousehold } from '../record/household.js';
import { compileCalculator, readPageData } from '../ui/build.js';
import { renderPage, renderReading } from '../ui/render.js';

/** Ample for {kind, province, district}, and small enough that nothing can pile up. */
const MAX_BODY_BYTES = 8 * 1024;

const PORT = Number(process.env['PORT'] ?? 8787);
const dataDir = resolveDataDir(process.cwd(), process.env);
const bundle = await compileCalculator();

// Read per request, so a report that lands while this is running shows up on a
// refresh rather than on a restart. Only the browser bundle is cached, because
// it is the one part that costs anything to make and the one part the record
// cannot change.
const fresh = () => readPageData(dataDir, bundle);

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
 * pile up, a refusal that is a refusal rather than a crash, and the guard —
 * and they had all three written out twice. The third copy is where they would
 * have started to differ.
 */
function withBody(request: IncomingMessage, response: Reply, act: (body: unknown) => void): void {
  try {
    assertLocalRequest(request.headers, PORT);
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
function saveHousehold(request: IncomingMessage, response: Reply): void {
  withBody(request, response, (body) => {
    writeHousehold(dataDir, parseHousehold(body));
    response.writeHead(204);
    response.end();
  });
}

/** A research request, queued for the session watching the queue. */
function queueRequest(request: IncomingMessage, response: Reply): void {
  withBody(request, response, (body) => {
    const parsed = parseRequest(body);
    appendRequest(dataDir, parsed, new Date().toISOString());
    console.log(`
MOPSOS_REQUEST ${JSON.stringify(parsed)}`);

    // The request is written; now say so where it will be acted on. The parent
    // process is the terminal hosting this server, which is the window the
    // Claude Code session is being read in.
    raiseTerminal({
      platform: process.platform,
      pid: process.ppid,
      bell: (sequence) => process.stdout.write(sequence),
      spawn: (command, args) => {
        spawn(command, args, { stdio: 'ignore', detached: false }).unref();
      },
    });

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
function serveReading(request: IncomingMessage, response: Reply, file: string | undefined): void {
  try {
    assertSameOrigin(request.headers, PORT);
  } catch (error) {
    response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(error instanceof NotLocalError ? error.message : 'Reddedildi');
    return;
  }

  const data = fresh();
  const found = findReading(data.research, file);

  if (found === undefined) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Böyle bir okuma yok');
    return;
  }

  html(response, renderReading(found, data));
}

const server = createServer((request, response) => {
  // The path, not a prefix of it: startsWith would claim /readings-summary and
  // anything else added later that happens to begin the same way.
  const asked = new URL(request.url ?? '/', `http://127.0.0.1:${String(PORT)}`);
  const route = `${request.method ?? 'GET'} ${asked.pathname}`;

  if (route === 'POST /household') return saveHousehold(request, response);
  if (route === 'POST /request') return queueRequest(request, response);
  if (route === 'GET /reading') {
    return serveReading(request, response, asked.searchParams.get('file') ?? undefined);
  }

  html(response, renderPage(fresh()));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Mopsos: http://127.0.0.1:${String(PORT)}`);
  console.log(`Record: ${dataDir}`);
  console.log(`Queue:  ${resolve(dataDir, 'requests.jsonl')}`);
});
