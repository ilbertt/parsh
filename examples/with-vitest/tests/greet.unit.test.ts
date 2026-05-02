import type { Print } from '@parshjs/core';
import {
  createTestCtx,
  runCommand,
  runCommandBeforeHandler,
  runCommandHandler,
} from '@parshjs/core/testing';
import { describe, expect, test, vi } from 'vitest';
import { command as greet } from '../src/commands/greet.ts';

function spyPrint(): Print {
  return {
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    dim: vi.fn(),
  };
}

function morningCtx({ name, shout }: { name: string; shout: boolean }) {
  const print = spyPrint();
  const ctx = createTestCtx({
    cmd: greet,
    options: { name, shout },
    params: {},
    context: { clock: () => new Date('2026-05-02T09:00:00Z') },
    print,
  });
  return { ctx, print };
}

describe('greet handler (atomic)', () => {
  test('prints the morning greeting', async () => {
    const { ctx, print } = morningCtx({ name: 'parsh', shout: false });

    await runCommandHandler({ cmd: greet, ctx });

    expect(print.success).toHaveBeenCalledExactlyOnceWith('good morning, parsh');
    expect(print.warn).not.toHaveBeenCalled();
  });

  test('--shout uppercases', async () => {
    const { ctx, print } = morningCtx({ name: 'parsh', shout: true });

    await runCommandHandler({ cmd: greet, ctx });

    expect(print.success).toHaveBeenCalledWith('GOOD MORNING, PARSH');
  });

  test('beforeHandler warns during quiet hours', async () => {
    const print = spyPrint();
    const ctx = createTestCtx({
      cmd: greet,
      options: { name: 'parsh', shout: false },
      params: {},
      context: { clock: () => new Date('2026-05-02T23:30:00Z') },
      print,
    });

    await runCommandBeforeHandler({ cmd: greet, ctx });

    expect(print.warn).toHaveBeenCalledWith('quiet hours — keeping it short');
    expect(print.success).not.toHaveBeenCalled();
  });
});

describe('greet (composed lifecycle)', () => {
  test('runs before → handler → after in order', async () => {
    const { ctx, print } = morningCtx({ name: 'parsh', shout: false });

    await runCommand({ cmd: greet, ctx });

    expect(print.success).toHaveBeenCalledWith('good morning, parsh');
    expect(print.dim).toHaveBeenCalledWith('done');

    const successOrder = (print.success as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!;
    const dimOrder = (print.dim as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!;
    expect(successOrder).toBeLessThan(dimOrder);
  });

  test('print may be omitted — handler runs against a silent default', async () => {
    const ctx = createTestCtx({
      cmd: greet,
      options: { name: 'parsh', shout: false },
      params: {},
      context: { clock: () => new Date('2026-05-02T09:00:00Z') },
    });

    await expect(runCommand({ cmd: greet, ctx })).resolves.toBeUndefined();
  });
});
