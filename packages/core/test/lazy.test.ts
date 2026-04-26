import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { runFixtureCli } from './helpers/fixture-cli.ts';

const FIXTURE = join(import.meta.dir, 'fixtures/loadtrack');
const BIN = join(FIXTURE, 'bin.ts');

const runCli = (args: string[]) => runFixtureCli({ bin: BIN, args });

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
