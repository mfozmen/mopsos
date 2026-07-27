export class NotLocalError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'NotLocalError';
  }
}

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

function isLocal(value: string | undefined, port: number): boolean {
  if (value === undefined) return false;

  const [host, given] = value.startsWith('[')
    ? [value.slice(0, value.indexOf(']') + 1), value.slice(value.indexOf(']') + 2)]
    : value.split(':');

  return LOCAL_HOSTS.has(host ?? '') && (given === undefined || given === String(port));
}

/**
 * Refuses anything that is not this page talking to its own server.
 *
 * Any site open in the browser can post to 127.0.0.1 — the loopback address is
 * not a boundary. It matters more here than in most local servers, because what
 * gets written is read back by an agent and acted on: a cross-origin write is a
 * way to put words into that agent's instructions.
 *
 * Three checks, each closing a different door:
 *
 * - **Host** must be the loopback name and this port. Without it, a domain the
 *   attacker controls can be pointed at 127.0.0.1 and the browser will treat it
 *   as same-origin — the Origin check alone would pass.
 * - **Origin**, when the browser sends one, must be this server. Absent is
 *   allowed: curl and the tests send none, and a request with no Origin did not
 *   come from a page.
 * - **Content type** must be JSON. A form post is the one shape that reaches a
 *   cross-origin server with no preflight, so it is refused by name.
 */
export function assertLocalRequest(
  headers: Record<string, string | string[] | undefined>,
  port: number,
): void {
  const header = (name: string): string | undefined => {
    const value = headers[name];
    return Array.isArray(value) ? value[0] : value;
  };

  if (!isLocal(header('host'), port)) {
    throw new NotLocalError('Bu sunucu yalnızca kendi sayfasından gelen isteği kabul eder');
  }

  const origin = header('origin');
  if (origin !== undefined && !isLocal(origin.replace(/^https?:\/\//, ''), port)) {
    throw new NotLocalError('Başka bir kaynaktan gelen istek reddedildi');
  }

  if (!(header('content-type') ?? '').includes('application/json')) {
    throw new NotLocalError('İstek JSON olmalı');
  }
}
