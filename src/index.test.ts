import { describe, expect, it } from 'vitest';

import { PROJECT_NAME } from './index.js';

describe('toolchain smoke test', () => {
  it('compiles TypeScript, runs Vitest and collects coverage', () => {
    expect(PROJECT_NAME).toBe('mopsos');
  });
});
