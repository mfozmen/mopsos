/**
 * Shows what the interface has asked for and nobody has taken yet, and takes it.
 *
 * Two sessions can watch the same queue. Claiming before acting is what stops
 * them doing the same work twice.
 *
 * Usage:
 *   npm run queue                 — what is pending
 *   npm run queue -- claim <at>   — take one, by its requested_at
 */
import { resolveDataDir } from '../config/data-dir.js';
import {
  claimRequest,
  describeRequest,
  pendingRequests,
  rejectedRequests,
} from '../server/requests.js';

const dataDir = resolveDataDir(process.cwd(), process.env);
const [action, requestedAt] = process.argv.slice(2);

if (action === 'claim') {
  if (requestedAt === undefined) {
    console.error('Usage: npm run queue -- claim <requested_at>');
    process.exit(2);
  }
  claimRequest(dataDir, requestedAt, `pid-${String(process.pid)}`);
  console.log(`Claimed: ${requestedAt}`);
} else {
  const rejected = rejectedRequests(dataDir);
  if (rejected.length > 0) {
    console.error(
      `${String(rejected.length)} request(s) would be refused today and will not be acted on:`,
    );
    for (const { request, reason } of rejected) {
      console.error(`  ${request.requested_at}  ${reason}`);
    }
    console.error('  To clear one: npm run queue -- claim <requested_at>\n');
  }

  const pending = pendingRequests(dataDir);
  if (pending.length === 0) {
    console.log('Nothing pending.');
  } else {
    console.log(`${String(pending.length)} pending:`);
    for (const request of pending) {
      console.log(`  ${request.requested_at}  ${describeRequest(request)}`);
    }
  }
}
