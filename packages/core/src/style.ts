/**
 * Tiny ANSI styling for help and error output. Auto-disables when the target
 * stream is not a TTY, `NO_COLOR` is set, or `FORCE_COLOR=0`. `FORCE_COLOR`
 * (any other value) wins over TTY detection.
 */

function envOverride(): boolean | null {
  const env = process.env;
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') {
    return false;
  }
  if (env.FORCE_COLOR === '0' || env.FORCE_COLOR === 'false') {
    return false;
  }
  if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== '') {
    return true;
  }
  return null;
}

function isColorEnabled(stream: NodeJS.WriteStream): boolean {
  const override = envOverride();
  return override ?? Boolean(stream.isTTY);
}

const STDOUT_ENABLED = isColorEnabled(process.stdout);
const STDERR_ENABLED = isColorEnabled(process.stderr);

function wrap({ open, close, enabled }: { open: number; close: number; enabled: boolean }) {
  return (s: string): string => (enabled ? `\x1b[${open}m${s}\x1b[${close}m` : s);
}

export const stdoutBold = wrap({ open: 1, close: 22, enabled: STDOUT_ENABLED });
export const stdoutDim = wrap({ open: 2, close: 22, enabled: STDOUT_ENABLED });
export const stdoutCyan = wrap({ open: 36, close: 39, enabled: STDOUT_ENABLED });

export const stderrBold = wrap({ open: 1, close: 22, enabled: STDERR_ENABLED });
export const stderrDim = wrap({ open: 2, close: 22, enabled: STDERR_ENABLED });
export const stderrRed = wrap({ open: 31, close: 39, enabled: STDERR_ENABLED });
