import { describe, expect, it, vi } from 'vitest';

import { raiseTerminal } from './attention.js';

describe('raiseTerminal', () => {
  it('rings the bell so the terminal flags itself in the taskbar', () => {
    const bell = vi.fn();

    raiseTerminal({ platform: 'linux', pid: 1, bell, spawn: vi.fn() });

    expect(bell).toHaveBeenCalledWith('\u0007');
  });

  it('raises the window on Windows, where the user actually is', () => {
    const spawn = vi.fn();

    raiseTerminal({ platform: 'win32', pid: 4242, bell: vi.fn(), spawn });

    expect(spawn).toHaveBeenCalledOnce();
    expect(JSON.stringify(spawn.mock.calls[0])).toContain('4242');
  });

  it('does not try to raise a window on a platform it has no way to', () => {
    const spawn = vi.fn();

    raiseTerminal({ platform: 'linux', pid: 1, bell: vi.fn(), spawn });

    expect(spawn).not.toHaveBeenCalled();
  });

  it('never lets a failure to get attention break the request', () => {
    // Stealing focus is a nicety. A queue write that succeeded must not be
    // reported as failed because a window would not come forward.
    const spawn = vi.fn(() => {
      throw new Error('no shell');
    });

    expect(() => raiseTerminal({ platform: 'win32', pid: 1, bell: vi.fn(), spawn })).not.toThrow();
  });
});
