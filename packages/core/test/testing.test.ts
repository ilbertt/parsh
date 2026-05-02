import { describe, expect, mock, test } from 'bun:test';
import { z } from 'zod';
import { defineCommand, defineRootCommand, type Print } from '#index.ts';
import {
  createTestCtx,
  runCommand,
  runCommandAfterHandler,
  runCommandBeforeHandler,
  runCommandHandler,
} from '#testing/index.ts';

declare module '#registry.ts' {
  interface CommandRegistry {
    upload: { parents: Record<string, never>; rootOptions: Record<string, never> };
    'upload [name]': { parents: Record<string, never>; rootOptions: Record<string, never> };
  }
}

function makeMockPrint(): Print {
  return {
    info: mock(),
    success: mock(),
    warn: mock(),
    error: mock(),
    dim: mock(),
  };
}

function defineUpload() {
  return defineCommand('upload', {
    options: { force: { schema: z.boolean().default(false) } },
    beforeHandler: (ctx) => {
      ctx.print.info(`before:${ctx.options.force}`);
    },
    handler: (ctx) => {
      if (!ctx.options.force) {
        throw new Error('not forced');
      }
      ctx.print.success('uploaded');
    },
    afterHandler: (ctx) => {
      ctx.print.dim('cleanup');
    },
  });
}

describe('createTestCtx', () => {
  test('fills defaults for parents, rootOptions, print', () => {
    const cmd = defineUpload();
    const ctx = createTestCtx({
      cmd,
      options: { force: true },
      params: {},
      context: undefined as never,
    });
    expect(ctx.parents).toEqual({});
    expect(ctx.rootOptions).toEqual({});
    expect(typeof ctx.print.info).toBe('function');
  });

  test('preserves a user-supplied print', () => {
    const cmd = defineUpload();
    const print = makeMockPrint();
    const ctx = createTestCtx({
      cmd,
      options: { force: true },
      params: {},
      context: undefined as never,
      print,
    });
    expect(ctx.print).toBe(print);
  });

  test('works for root commands', () => {
    const root = defineRootCommand({
      options: { verbose: { schema: z.boolean().default(false) } },
      handler: () => {},
    });
    const ctx = createTestCtx({
      cmd: root,
      options: { verbose: true },
      context: undefined as never,
    });
    expect(ctx.options.verbose).toBe(true);
    expect(typeof ctx.print.success).toBe('function');
  });
});

describe('atomic runners', () => {
  test('runCommandBeforeHandler runs only beforeHandler', async () => {
    const cmd = defineUpload();
    const print = makeMockPrint();
    const ctx = createTestCtx({
      cmd,
      options: { force: false },
      params: {},
      context: undefined as never,
      print,
    });
    await runCommandBeforeHandler({ cmd, ctx });
    expect(print.info).toHaveBeenCalledWith('before:false');
    expect(print.success).not.toHaveBeenCalled();
    expect(print.dim).not.toHaveBeenCalled();
  });

  test('runCommandHandler runs only handler — beforeHandler is not called', async () => {
    const cmd = defineUpload();
    const print = makeMockPrint();
    const ctx = createTestCtx({
      cmd,
      options: { force: true },
      params: {},
      context: undefined as never,
      print,
    });
    await runCommandHandler({ cmd, ctx });
    expect(print.success).toHaveBeenCalledWith('uploaded');
    expect(print.info).not.toHaveBeenCalled();
  });

  test('runCommandAfterHandler runs only afterHandler', async () => {
    const cmd = defineUpload();
    const print = makeMockPrint();
    const ctx = createTestCtx({
      cmd,
      options: { force: true },
      params: {},
      context: undefined as never,
      print,
    });
    await runCommandAfterHandler({ cmd, ctx });
    expect(print.dim).toHaveBeenCalledWith('cleanup');
  });

  test('handler throw propagates', async () => {
    const cmd = defineUpload();
    const ctx = createTestCtx({
      cmd,
      options: { force: false },
      params: {},
      context: undefined as never,
    });
    await expect(runCommandHandler({ cmd, ctx })).rejects.toThrow('not forced');
  });

  test('throws on missing handler', async () => {
    const cmd = defineCommand('upload', {
      options: { force: { schema: z.boolean().default(false) } },
    });
    const ctx = createTestCtx({
      cmd,
      options: { force: true },
      params: {},
      context: undefined as never,
    });
    await expect(runCommandHandler({ cmd, ctx })).rejects.toThrow('no `handler` defined');
  });
});

describe('runCommand', () => {
  test('runs full lifecycle in order', async () => {
    const cmd = defineUpload();
    const print = makeMockPrint();
    const ctx = createTestCtx({
      cmd,
      options: { force: true },
      params: {},
      context: undefined as never,
      print,
    });
    await runCommand({ cmd, ctx });
    expect(print.info).toHaveBeenCalledWith('before:true');
    expect(print.success).toHaveBeenCalledWith('uploaded');
    expect(print.dim).toHaveBeenCalledWith('cleanup');
  });

  test('beforeHandler throw aborts handler and afterHandler', async () => {
    const cmd = defineCommand('upload', {
      options: {},
      beforeHandler: () => {
        throw new Error('blocked');
      },
      handler: (ctx) => {
        ctx.print.info('handler-ran');
      },
      afterHandler: (ctx) => {
        ctx.print.info('after-ran');
      },
    });
    const print = makeMockPrint();
    const ctx = createTestCtx({
      cmd,
      options: {},
      params: {},
      context: undefined as never,
      print,
    });
    await expect(runCommand({ cmd, ctx })).rejects.toThrow('blocked');
    expect(print.info).not.toHaveBeenCalled();
  });

  test('handler throw skips afterHandler', async () => {
    const beforeRan = mock();
    const afterRan = mock();
    const cmd = defineCommand('upload', {
      options: {},
      beforeHandler: () => {
        beforeRan();
      },
      handler: () => {
        throw new Error('boom');
      },
      afterHandler: () => {
        afterRan();
      },
    });
    const ctx = createTestCtx({
      cmd,
      options: {},
      params: {},
      context: undefined as never,
    });
    await expect(runCommand({ cmd, ctx })).rejects.toThrow('boom');
    expect(beforeRan).toHaveBeenCalled();
    expect(afterRan).not.toHaveBeenCalled();
  });
});
