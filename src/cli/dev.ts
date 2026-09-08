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
 * the page was a quarter of it for three of them. The answer is rendered by the
 * same function that used to print them inline: a second renderer would drift,
 * and the drift would be two tables of plausible numbers disagreeing.
 *
 * What each route does lives in `server/app.ts`, so it can be served on a real
 * socket in a test. This file is the wiring: which port, which record, and the
 * two things a test must not do — ring the terminal and write to the console.
 *
 * Usage: npm run dev
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { resolve } from 'node:path';

import { resolveDataDir } from '../config/data-dir.js';
import { routes } from '../server/app.js';
import { raiseTerminal } from '../server/attention.js';
import { compileCalculator, readPageData } from '../ui/build.js';

const PORT = Number(process.env['PORT'] ?? 8787);
const dataDir = resolveDataDir(process.cwd(), process.env);
const bundle = await compileCalculator();

const server = createServer(
  routes({
    dataDir,
    port: () => PORT,
    // Read per request, so a report that lands while this is running shows up
    // on a refresh rather than on a restart. Only the browser bundle is cached,
    // because it is the one part that costs anything to make and the one part
    // the record cannot change.
    page: () => readPageData(dataDir, bundle),
    // The request is written; now say so where it will be acted on. The parent
    // process is the terminal hosting this server, which is the window the
    // Claude Code session is being read in.
    announce: () =>
      raiseTerminal({
        platform: process.platform,
        pid: process.ppid,
        bell: (sequence) => process.stdout.write(sequence),
        spawn: (command, args) => {
          spawn(command, args, { stdio: 'ignore', detached: false }).unref();
        },
      }),
    log: (line) => {
      console.log(line);
    },
  }),
);

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Mopsos: http://127.0.0.1:${String(PORT)}`);
  console.log(`Record: ${dataDir}`);
  console.log(`Queue:  ${resolve(dataDir, 'requests.jsonl')}`);
});
