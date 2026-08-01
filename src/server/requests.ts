import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const QUEUE = 'requests.jsonl';
const MAX_PLACE_LENGTH = 80;

/**
 * Letters, spaces, hyphens and apostrophes. Nothing else.
 *
 * An allowlist rather than an escape, because this value is read back out of the
 * queue and handed to an agent as part of its instructions. Anything that is not
 * a place name — a newline, a backtick, a semicolon, a tag — is a way to put
 * words in that agent's mouth, and escaping is the wrong tool for a field that
 * has no legitimate use for any of them.
 */
// Digits and a full stop belong here: four of the forty-five mahalle names in
// the record are "30 Ağustos", "29 Ekim", "9 Eylül" and "85.yıl Cumhuriyet". A
// letters-only pattern refuses the exact places this is for. Neither character
// weakens the guard — what it exists to keep out is a slash, a backslash and
// anything that could read as an instruction rather than a name.
const PLACE = /^[\p{L}\p{M}\d][\p{L}\p{M}\d .'’-]*$/u;

export type Request =
  | { kind: 'rates' }
  | {
      kind: 'market';
      province: string;
      district: string;
      /**
       * One mahalle rather than the whole district.
       *
       * Absent means the district, which is the right default for a first
       * reading. It earns its place on the second: narrowing the request
       * narrows the work — fewer listings to read, a tighter mix to hold
       * steady, and a scout that can afford to look harder at one place.
       */
      neighbourhood?: string;
    };

export interface QueuedRequest {
  kind: string;
  province?: string;
  district?: string;
  neighbourhood?: string;
  requested_at: string;
}

export class InvalidRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRequestError';
  }
}

function place(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new InvalidRequestError(`${field} boş olamaz`);
  }
  if (value.length > MAX_PLACE_LENGTH) {
    throw new InvalidRequestError(`${field} bir yer adı için fazla uzun`);
  }

  const trimmed = value.trim();
  if (!PLACE.test(trimmed)) {
    throw new InvalidRequestError(`${field} bir yer adı gibi görünmüyor`);
  }

  return trimmed;
}

/**
 * Turns whatever the page posted into a request, or refuses.
 *
 * Rebuilt field by field rather than passed through. The calculator on the same
 * page holds amounts, which are personal data; if a future change ever put them
 * in the body, this is what keeps them out of a file that gets committed.
 */
export function parseRequest(body: unknown): Request {
  if (typeof body !== 'object' || body === null) {
    throw new InvalidRequestError('İstek okunamadı');
  }

  const { kind } = body as { kind?: unknown };

  if (kind === 'rates') return { kind: 'rates' };

  if (kind === 'market') {
    const { province, district, neighbourhood } = body as {
      province?: unknown;
      district?: unknown;
      neighbourhood?: unknown;
    };
    // Empty is not a failure here, unlike the two above it: leaving the field
    // alone is how you ask for the whole district, which is what the form did
    // before this existed.
    const named =
      typeof neighbourhood === 'string' && neighbourhood.trim().length > 0
        ? { neighbourhood: place(neighbourhood, 'Mahalle') }
        : {};

    return {
      kind: 'market',
      province: place(province, 'İl'),
      district: place(district, 'İlçe'),
      ...named,
    };
  }

  throw new InvalidRequestError(`Bilinmeyen istek türü: ${String(kind)}`);
}

/**
 * One queued request, in one line, for whoever is about to run it.
 *
 * The neighbourhood belongs here or the narrowing is invisible: a request for
 * one mahalle that prints as a district run gets a district run, and the whole
 * point of asking for one place is that the scout can afford to look harder at
 * it.
 */
export function describeRequest(request: QueuedRequest): string {
  const where = [request.province, request.district, request.neighbourhood].filter(
    (part) => part !== undefined,
  );

  return where.length === 0 ? request.kind : `${request.kind} ${where.join('/')}`;
}

/**
 * Appends a request to the queue.
 *
 * Append-only like everything else here: what was asked for and when is part of
 * the record, and a queue that is rewritten cannot later answer "why does the
 * record have a gap in March".
 */
export function appendRequest(root: string, request: Request, at: string): void {
  appendFileSync(
    join(root, QUEUE),
    `${JSON.stringify({ ...request, requested_at: at })}\n`,
    'utf8',
  );
}

export function readRequests(root: string): QueuedRequest[] {
  const path = join(root, QUEUE);
  if (!existsSync(path)) return [];

  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as QueuedRequest);
}

const CLAIMS = 'claims.jsonl';

export interface Claim {
  /** The `requested_at` of the request being claimed. */
  request: string;
  by: string;
  at: string;
}

/**
 * Marks a request as taken.
 *
 * Two sessions can watch the same queue, and without this they both act: six
 * scouts once re-read what six others had just read, minutes apart. The only
 * reason that was not pure waste is that the readings happened to agree.
 *
 * A separate file rather than a flag on the request, because the queue is
 * append-only — and because who reached for what, and when, is worth being able
 * to look at later. Claiming twice is not an error; it is what a race looks
 * like, and both claims are kept.
 */
export function claimRequest(root: string, requestedAt: string, by: string, at?: string): void {
  const claim: Claim = { request: requestedAt, by, at: at ?? new Date().toISOString() };
  appendFileSync(join(root, CLAIMS), `${JSON.stringify(claim)}\n`, 'utf8');
}

export function readClaims(root: string): Claim[] {
  const path = join(root, CLAIMS);
  if (!existsSync(path)) return [];

  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Claim);
}

function unclaimed(root: string): QueuedRequest[] {
  const claimed = new Set(readClaims(root).map((claim) => claim.request));
  return readRequests(root).filter((request) => !claimed.has(request.requested_at));
}

/**
 * Checked again on the way out, not only on the way in.
 *
 * Guarding the door does not clean what is already inside. A request written
 * before the guards existed — or by a future bug, or by hand — is still read
 * back and handed to an agent as part of its instructions, so the same gate
 * applies in both directions.
 */
function check(request: QueuedRequest): string | undefined {
  try {
    parseRequest(request);
    return undefined;
  } catch (error) {
    return error instanceof InvalidRequestError ? error.message : 'İstek okunamadı';
  }
}

/** Requests nobody has taken yet, and that would still be accepted today. */
export function pendingRequests(root: string): QueuedRequest[] {
  return unclaimed(root).filter((request) => check(request) === undefined);
}

/**
 * Queued requests that would not be accepted today, with why.
 *
 * Reported rather than dropped in silence: a refused line sitting in the file
 * with nobody looking at it is how a poisoned queue stays poisoned. Claiming one
 * clears it, which is how it gets dealt with.
 */
export function rejectedRequests(root: string): { request: QueuedRequest; reason: string }[] {
  return unclaimed(root)
    .map((request) => ({ request, reason: check(request) }))
    .filter(
      (entry): entry is { request: QueuedRequest; reason: string } => entry.reason !== undefined,
    );
}
