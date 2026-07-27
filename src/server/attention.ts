export interface AttentionOptions {
  platform: string;
  /** The process whose window should come forward — the terminal, not this one. */
  pid: number;
  bell: (sequence: string) => void;
  spawn: (command: string, args: string[]) => void;
}

/**
 * Tells the user their attention is wanted in the terminal.
 *
 * The queue only works if somebody is watching it: a request sits unread until
 * the Claude Code session picks it up, and the session is in a window that is,
 * by definition, not the one being looked at. A button that silently writes a
 * line to a file is indistinguishable from a button that does nothing.
 *
 * Two levels, because raising a window is rude and does not always work:
 *
 * - **The bell**, everywhere. Terminals flag themselves in the taskbar and stop
 *   there. It is the polite half and the half that cannot fail.
 * - **The window**, on Windows only. `AppActivate` is part of Windows itself, so
 *   this adds no dependency. Windows may refuse to hand focus to a background
 *   process, which is why the bell is not conditional on it.
 *
 * Failure is swallowed by design. The queue write has already succeeded at this
 * point; reporting it as failed because a window would not come forward would
 * turn a nicety into a bug.
 */
export function raiseTerminal({ platform, pid, bell, spawn }: AttentionOptions): void {
  try {
    bell('\u0007');

    if (platform !== 'win32') return;

    spawn('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `(New-Object -ComObject WScript.Shell).AppActivate(${String(pid)})`,
    ]);
  } catch {
    // Deliberately silent — see above.
  }
}
