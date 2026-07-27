import { describe, expect, it } from 'vitest';

import { explainFetchFailure } from './fetch.js';

const URL = 'https://www.bddk.org.tr/Mevzuat/DokumanGetir/1327';

describe('explainFetchFailure', () => {
  it('names the certificate problem and how to work around it', () => {
    // Several Turkish public bodies serve an incomplete certificate chain. Node
    // rejects it where curl accepts it, and "fetch failed" tells nobody that.
    const error = Object.assign(new TypeError('fetch failed'), {
      cause: {
        code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
        message: 'unable to verify the first certificate',
      },
    });

    const message = explainFetchFailure(URL, error);

    expect(message).toContain('certificate');
    expect(message).toContain('curl');
    expect(message).toContain(URL);
  });

  it('does not suggest turning verification off', () => {
    const error = Object.assign(new TypeError('fetch failed'), {
      cause: { code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', message: 'x' },
    });

    expect(explainFetchFailure(URL, error)).not.toMatch(/NODE_TLS_REJECT_UNAUTHORIZED|--insecure/);
  });

  it('reports an HTTP status when the server answered', () => {
    expect(explainFetchFailure(URL, new Error('returned 404 Not Found'))).toContain('404');
  });

  it('falls back to the underlying message rather than swallowing it', () => {
    expect(explainFetchFailure(URL, new Error('getaddrinfo ENOTFOUND'))).toContain('ENOTFOUND');
  });
});
