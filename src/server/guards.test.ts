import { describe, expect, it } from 'vitest';

import { assertLocalRequest, NotLocalError } from './guards.js';

const PORT = 8787;
const ok = { host: '127.0.0.1:8787', 'content-type': 'application/json' };

describe('assertLocalRequest', () => {
  it('allows the page it serves', () => {
    expect(() =>
      assertLocalRequest({ ...ok, origin: 'http://127.0.0.1:8787' }, PORT),
    ).not.toThrow();
  });

  it('allows localhost as well as the address', () => {
    expect(() =>
      assertLocalRequest(
        {
          host: 'localhost:8787',
          origin: 'http://localhost:8787',
          'content-type': 'application/json',
        },
        PORT,
      ),
    ).not.toThrow();
  });

  it('allows a request with no Origin, which is how curl and the tests call it', () => {
    expect(() => assertLocalRequest(ok, PORT)).not.toThrow();
  });

  it('refuses another site posting to this server', () => {
    // Any page open in the browser can POST to 127.0.0.1. This queue is read by
    // an agent and acted on, so a cross-origin write is a way to put words in
    // its instructions.
    expect(() => assertLocalRequest({ ...ok, origin: 'https://evil.example' }, PORT)).toThrow(
      NotLocalError,
    );
  });

  it('refuses a hostname that merely resolves here', () => {
    // DNS rebinding: a domain the attacker controls, pointed at 127.0.0.1.
    // Checking Host closes it regardless of anything else.
    expect(() => assertLocalRequest({ ...ok, host: 'rebind.evil.example:8787' }, PORT)).toThrow(
      NotLocalError,
    );
  });

  it('refuses a host on another port', () => {
    expect(() => assertLocalRequest({ ...ok, host: '127.0.0.1:9999' }, PORT)).toThrow(
      NotLocalError,
    );
  });

  it('refuses a form post, which is the shape that needs no preflight', () => {
    // A JSON content type forces a CORS preflight for anything cross-origin.
    // A form post does not, which makes it the one to shut out by name.
    expect(() =>
      assertLocalRequest({ ...ok, 'content-type': 'application/x-www-form-urlencoded' }, PORT),
    ).toThrow(NotLocalError);
  });

  it('refuses a missing host outright rather than assuming the best', () => {
    expect(() => assertLocalRequest({ 'content-type': 'application/json' }, PORT)).toThrow(
      NotLocalError,
    );
  });
});
