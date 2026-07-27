/**
 * The live page: serves ui/index.html and takes research requests from it.
 *
 * Requests are appended to a queue in the private data directory. Nothing here
 * runs an agent — the Claude Code session watching the queue does that, so the
 * work happens where you can see it, steer it, and stop it.
 *
 * Usage: npm run dev
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { resolveDataDir } from '../config/data-dir.js';
import { raiseTerminal } from '../server/attention.js';
import { assertLocalRequest, NotLocalError } from '../server/guards.js';
import { appendRequest, InvalidRequestError, parseRequest } from '../server/requests.js';

/** Ample for {kind, province, district}, and small enough that nothing can pile up. */
const MAX_BODY_BYTES = 8 * 1024;

const PORT = Number(process.env['PORT'] ?? 8787);
const dataDir = resolveDataDir(process.cwd(), process.env);

const server = createServer((request, response) => {
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

  // Read from disk per request so a regenerated page appears on refresh without
  // restarting the server.
  try {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(readFileSync('ui/index.html', 'utf8'));
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('ui/index.html yok — önce npm run ui');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Mopsos: http://127.0.0.1:${String(PORT)}`);
  console.log(`Record: ${dataDir}`);
  console.log(`Queue:  ${resolve(dataDir, 'requests.jsonl')}`);
});
