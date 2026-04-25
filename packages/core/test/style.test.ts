import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

const FIXTURE = join(import.meta.dir, 'fixtures/loadtrack');
const BIN = join(FIXTURE, 'bin.ts');
const ESC = '\x1b';
const ANSI = new RegExp(`${ESC}\\[\\d+m`);

interface RunResult {
  stdout: string;
  stderr: string;
}

async function runCli({
  args,
  env,
}: {
  args: string[];
  env: Record<string, string>;
}): Promise<RunResult> {
  const proc = Bun.spawn(['bun', BIN, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, ...env },
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;
  return { stdout, stderr };
}

describe('help styling', () => {
  test('FORCE_COLOR=1 emits ANSI codes in --help output', async () => {
    const r = await runCli({ args: ['--help'], env: { FORCE_COLOR: '1' } });
    expect(r.stdout).toMatch(ANSI);
    expect(r.stdout).toContain('\x1b[1mUsage:\x1b[22m');
  });

  test('NO_COLOR=1 strips ANSI codes even when FORCE_COLOR is set', async () => {
    const r = await runCli({ args: ['--help'], env: { FORCE_COLOR: '1', NO_COLOR: '1' } });
    expect(r.stdout).not.toMatch(ANSI);
    expect(r.stdout).toContain('Usage:');
  });

  test('FORCE_COLOR=0 disables ANSI codes', async () => {
    const r = await runCli({ args: ['--help'], env: { FORCE_COLOR: '0' } });
    expect(r.stdout).not.toMatch(ANSI);
  });

  test('non-TTY pipe with no env override emits plain text', async () => {
    const r = await runCli({ args: ['--help'], env: { FORCE_COLOR: '', NO_COLOR: '' } });
    expect(r.stdout).not.toMatch(ANSI);
  });
});

describe('error styling', () => {
  test('FORCE_COLOR=1 wraps the program-name prefix in red+bold on stderr', async () => {
    const r = await runCli({ args: ['nonexistent'], env: { FORCE_COLOR: '1' } });
    expect(r.stderr).toContain('\x1b[31m\x1b[1mloadtrack\x1b[22m\x1b[39m');
    expect(r.stderr).toContain('unknown command');
  });

  test('FORCE_COLOR=1 dims the --help hint on stderr', async () => {
    const r = await runCli({ args: ['alpha'], env: { FORCE_COLOR: '1' } });
    expect(r.stderr).toContain('\x1b[2m — use --help or -h to see usage\x1b[22m');
  });

  test('NO_COLOR=1 leaves the parsh-emitted prefix plain', async () => {
    // Bun's own console.error wraps stderr in red when FORCE_COLOR is set in
    // the spawned env, regardless of NO_COLOR — so we assert specifically that
    // parsh's red+bold prefix is absent rather than scanning for any ANSI.
    const r = await runCli({ args: ['nonexistent'], env: { FORCE_COLOR: '1', NO_COLOR: '1' } });
    expect(r.stderr).not.toContain('\x1b[31m\x1b[1mloadtrack');
    expect(r.stderr).toContain('loadtrack: unknown command');
  });
});
