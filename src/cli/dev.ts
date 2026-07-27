/**
 * The live page: serves ui/index.html and takes research requests from it.
 *
 * Requests are appended to a queue in the private data directory. Nothing here
 * runs an agent — the Claude Code session watching the queue does that, so the
 * work happens where you can see it, steer it, and stop it.
 *
 * Usage: npm run dev
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { resolveDataDir } from '../config/data-dir.js';
import { appendRequest, InvalidRequestError, parseRequest } from '../server/requests.js';

const PORT = Number(process.env['PORT'] ?? 8787);
const dataDir = resolveDataDir(process.cwd(), process.env);

const server = createServer((request, response) => {
  if (request.method === 'POST' && request.url === '/request') {
    let body = '';
    request.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')));
    request.on('end', () => {
      try {
        const parsed = parseRequest(JSON.parse(body));
        appendRequest(dataDir, parsed, new Date().toISOString());
        console.log(`\nMOPSOS_REQUEST ${JSON.stringify(parsed)}`);
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
