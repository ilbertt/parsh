import { ExitSignal, type Print } from '@parshjs/core';
import { createTestCtx } from '@parshjs/core/testing';
import { afterEach, expect, test, vi } from 'vitest';
import { makeCli, onError } from '../src/cli.ts';
import { command as greet } from '../src/commands/greet.ts';
import { BlankNameError } from '../src/errors.ts';

const EXIT_BLANK_NAME = 3;

afterEach(() => {
  vi.restoreAllMocks();
});

function spyPrint(): Print {
  return {
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    dim: vi.fn(),
  };
}

test('integration: BlankNameError → custom exit code + stderr message', async () => {
  const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

  const code = await makeCli({ context: { clock: () => new Date() } }).run([
    'greet',
    '--name',
    '   ',
  ]);

  const err = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
  expect(code).toBe(EXIT_BLANK_NAME);
  expect(err).toContain('name cannot be blank');
});

test('direct call: branches on code, returns exit(3), prints message', async () => {
  const print = spyPrint();
  const ctx = createTestCtx({
    cmd: greet,
    options: { name: '  ', shout: false },
    params: {},
    context: { clock: () => new Date() },
    print,
  });

  const result = await onError({
    code: 'BlankNameError',
    error: new BlankNameError(),
    ctx,
    print,
    exit: (n) => new ExitSignal(n),
  });

  expect(result).toBeInstanceOf(ExitSignal);
  expect((result as ExitSignal).code).toBe(EXIT_BLANK_NAME);
  expect(print.error).toHaveBeenCalledWith('✘ name cannot be blank or whitespace');
});
