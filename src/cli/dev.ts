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
import { createServer } from 'node:http';
import { resolve } from 'node:path';

import { resolveDataDir } from '../config/data-dir.js';
import { raiseTerminal } from '../server/attention.js';
import { assertLocalRequest, assertSameOrigin, NotLocalError } from '../server/guards.js';
import { readingFile } from '../server/reading.js';
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

const server = createServer((request, response) => {
  if (request.method === 'POST' && request.url === '/household') {
    try {
      assertLocalRequest(request.headers, PORT);
    } catch (error) {
      response.writeHead(403, { 'content-type': 'application/json; charset=utf-8' });
      response.end(
        JSON.stringify({ error: error instanceof NotLocalError ? error.message : 'Reddedildi' }),
      );
      return;
    }

    let household = '';
    request.on('data', (chunk: Buffer) => {
      household += chunk.toString('utf8');
      if (household.length > MAX_BODY_BYTES) {
        response.writeHead(413, { 'content-type': 'application/json; charset=utf-8' });
        response.end('{"error":"İstek fazla büyük"}');
        request.destroy();
      }
    });
    request.on('end', () => {
      if (response.writableEnded) return;
      try {
        // Overwritten rather than appended: this is a current state, not an
        // observation. The record's append-only rule is about measurements, and
        // nothing here was measured.
        writeHousehold(dataDir, parseHousehold(JSON.parse(household)));
        response.writeHead(204);
        response.end();
      } catch (error) {
        const message = error instanceof InvalidRequestError ? error.message : 'Okunamadı';
        response.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ error: message }));
      }
    });
    return;
  }

  if (request.method === 'POST' && request.url === '/request') {
    try {
      assertLocalRequest(request.headers, PORT);
    } catch (error) {
      response.writeHead(403, { 'content-type': 'application/json; charset=utf-8' });
      response.end(
        JSON.stringify({ error: error instanceof NotLocalError ? error.message : 'Reddedildi' }),
      );
      return;
    }

    let body = '';
    request.on('data', (chunk: Buffer) => {
      body += chunk.toString('utf8');
      if (body.length > MAX_BODY_BYTES) {
        response.writeHead(413, { 'content-type': 'application/json; charset=utf-8' });
        response.end('{"error":"İstek fazla büyük"}');
        request.destroy();
      }
    });
    request.on('end', () => {
      if (response.writableEnded) return;
      try {
        const parsed = parseRequest(JSON.parse(body));
        appendRequest(dataDir, parsed, new Date().toISOString());
        console.log(`\nMOPSOS_REQUEST ${JSON.stringify(parsed)}`);

        // The request is written; now say so where it will be acted on. The
        // parent process is the terminal hosting this server, which is the
        // window the Claude Code session is being read in.
        raiseTerminal({
          platform: process.platform,
          pid: process.ppid,
          bell: (sequence) => process.stdout.write(sequence),
          spawn: (command, args) => {
            spawn(command, args, { stdio: 'ignore', detached: false }).unref();
          },
        });

        response.writeHead(202, { 'content-type': 'application/json' });
        response.end('{"queued":true}');
      } catch (error) {
        const message = error instanceof InvalidRequestError ? error.message : 'İstek okunamadı';
        response.writeHead(400, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: message }));
      }
    });
    return;
  }

  const asked = new URL(request.url ?? '/', `http://127.0.0.1:${String(PORT)}`);

  // The path, not a prefix of it: startsWith would claim /readings-summary and
  // anything else added later that happens to begin the same way.
  if (request.method === 'GET' && asked.pathname === '/reading') {
    // The Host and Origin checks, not the JSON one: this reads, and a GET has
    // no body to be the cross-origin form post that check refuses. What still
    // applies is the rebinding door guards.ts describes, and this is the
    // endpoint that names files out of the private record.
    try {
      assertSameOrigin(request.headers, PORT);
    } catch (error) {
      response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
      response.end(error instanceof NotLocalError ? error.message : 'Reddedildi');
      return;
    }

    const data = fresh();
    const wanted = readingFile(
      asked.searchParams.get('file') ?? undefined,
      data.research.flatMap((report) => [report.file, ...report.earlier.map((old) => old.file)]),
    );
    const found = data.research
      .flatMap((report) => [report, ...report.earlier])
      .find((report) => report.file === wanted);

    if (found === undefined) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Böyle bir okuma yok');
      return;
    }

    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(renderReading(found, data));
    return;
  }

  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(renderPage(fresh()));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Mopsos: http://127.0.0.1:${String(PORT)}`);
  console.log(`Record: ${dataDir}`);
  console.log(`Queue:  ${resolve(dataDir, 'requests.jsonl')}`);
});
