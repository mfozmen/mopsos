import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const QUEUE = 'requests.jsonl';
const MAX_PLACE_LENGTH = 80;

export type Request = { kind: 'rates' } | { kind: 'market'; province: string; district: string };

export interface QueuedRequest {
  kind: string;
  province?: string;
  district?: string;
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
  return value.trim();
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
    const { province, district } = body as { province?: unknown; district?: unknown };
    return {
      kind: 'market',
      province: place(province, 'İl'),
      district: place(district, 'İlçe'),
    };
  }

  throw new InvalidRequestError(`Bilinmeyen istek türü: ${String(kind)}`);
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
