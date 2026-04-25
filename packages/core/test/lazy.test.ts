import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

const FIXTURE = join(import.meta.dir, 'fixtures/loadtrack');
const BIN = join(FIXTURE, 'bin.ts');

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  loaded: ReadonlyArray<string>;
}

async function runCli(args: string[]): Promise<RunResult> {
  const proc = Bun.spawn(['bun', BIN, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  const loaded = stdout
    .split('\n')
    .filter((l) => l.startsWith('LOADED:'))
    .map((l) => l.slice('LOADED:'.length));
  return { exitCode, stdout, stderr, loaded };
}

describe('lazy dispatch', () => {
  test('dispatches a leaf, loading only target + ancestors', async () => {
    const r = await runCli(['alpha', '--name', 'x', 'sub']);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('alpha-sub:x:flag=false');
    // alpha (ancestor), alpha/sub (target), _root (always visited).
    expect(new Set(r.loaded)).toEqual(new Set(['_root', 'alpha', 'alpha/sub']));
    // beta + beta/leaf must NOT load.
    expect(r.loaded).not.toContain('beta');
    expect(r.loaded).not.toContain('beta/leaf');
  });

  test('dispatches a sibling subtree without loading the other', async () => {
    const r = await runCli(['beta', '--n', '7']);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('beta:7');
    expect(new Set(r.loaded)).toEqual(new Set(['_root', 'beta']));
    expect(r.loaded).not.toContain('alpha');
    expect(r.loaded).not.toContain('alpha/sub');
    expect(r.loaded).not.toContain('beta/leaf');
  });
});

describe('zero-load paths', () => {
  test('--help at root loads no handler modules', async () => {
    const r = await runCli(['--help']);
    expect(r.exitCode).toBe(0);
    expect(r.loaded).toEqual([]);
    expect(r.stdout).toContain('Usage:');
  });

  test('--help on a subcommand loads no handler modules', async () => {
    const r = await runCli(['alpha', 'sub', '--help']);
    expect(r.exitCode).toBe(0);
    expect(r.loaded).toEqual([]);
    expect(r.stdout).toContain('Usage:');
  });

  test('unknown command loads no handler modules', async () => {
    const r = await runCli(['nonexistent']);
    expect(r.exitCode).toBe(2);
    expect(r.loaded).toEqual([]);
    expect(r.stderr.toLowerCase()).toContain('unknown command');
  });

  test('unknown nested command loads no handler modules', async () => {
    const r = await runCli(['alpha', 'wrong']);
    expect(r.exitCode).toBe(2);
    expect(r.loaded).toEqual([]);
  });
});
