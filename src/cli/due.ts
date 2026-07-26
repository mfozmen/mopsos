/**
 * Lists verdicts whose value can now be read and which have no outcome yet.
 *
 * Exit code 1 when something is due, so a scheduled reminder can act on it. An
 * unresolved verdict costs nothing to ignore on any given day and hollows out
 * the track record over months — the failure that needs an alarm, not a habit.
 *
 * Usage: npm run due [researchRoot] [today]
 */
import { dueVerdicts, formatDueReport, localIsoDate } from '../research/due.js';
import { loadResolvedVerdictIds, loadVerdicts } from '../research/load.js';

const root = process.argv[2] ?? 'research';
const today = process.argv[3] ?? localIsoDate(new Date());

const due = dueVerdicts(loadVerdicts(root), loadResolvedVerdictIds(root), today);

console.log(formatDueReport(due, today));
process.exit(due.length === 0 ? 0 : 1);
