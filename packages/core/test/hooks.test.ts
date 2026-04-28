import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { createCli, type LoadedCommand } from '#index.ts';
import { lazyCommand, literal, root } from './helpers/runtime-tree.ts';
import { captureStdio } from './helpers/stdio.ts';

const { stderrText } = captureStdio();

function makeCli(loaded: LoadedCommand) {
  return createCli({
    programName: 't',
    tree: root({
      command: null,
      children: {
        run: literal({
          value: 'run',
          command: lazyCommand({
            path: 'run',
            loaded,
          }),
        }),
      },
    }),
  });
}

describe('command hooks', () => {
  test('beforeHandler → handler → afterHandler run in order', async () => {
    const calls: string[] = [];
    const code = await makeCli({
      options: { name: { schema: z.string() } },
      beforeHandler: () => {
        calls.push('before');
      },
      handler: () => {
        calls.push('handler');
      },
      afterHandler: () => {
        calls.push('after');
      },
    }).run(['run', '--name', 'x']);
    expect(code).toBe(0);
    expect(calls).toEqual(['before', 'handler', 'after']);
  });

  test('beforeHandler throwing skips handler and afterHandler, exits 1', async () => {
    const calls: string[] = [];
    const code = await makeCli({
      options: { name: { schema: z.string() } },
      beforeHandler: () => {
        throw new Error('blocked');
      },
      handler: () => {
        calls.push('handler');
      },
      afterHandler: () => {
        calls.push('after');
      },
    }).run(['run', '--name', 'x']);
    expect(code).toBe(1);
    expect(calls).toEqual([]);
    expect(stderrText()).toContain('blocked');
  });

  test('handler throwing skips afterHandler, exits 1', async () => {
    const calls: string[] = [];
    const code = await makeCli({
      options: { name: { schema: z.string() } },
      beforeHandler: () => {
        calls.push('before');
      },
      handler: () => {
        throw new Error('boom');
      },
      afterHandler: () => {
        calls.push('after');
      },
    }).run(['run', '--name', 'x']);
    expect(code).toBe(1);
    expect(calls).toEqual(['before']);
    expect(stderrText()).toContain('boom');
  });

  test('afterHandler throwing surfaces as afterHandler error, exits 1', async () => {
    const code = await makeCli({
      options: { name: { schema: z.string() } },
      handler: () => {},
      afterHandler: () => {
        throw new Error('post-fail');
      },
    }).run(['run', '--name', 'x']);
    expect(code).toBe(1);
    expect(stderrText()).toContain('post-fail');
  });

  test('hooks see the same ctx as the handler', async () => {
    let beforeCtx: unknown;
    let handlerCtx: unknown;
    let afterCtx: unknown;
    const code = await makeCli({
      options: { name: { schema: z.string() } },
      beforeHandler: (ctx) => {
        beforeCtx = ctx;
      },
      handler: (ctx) => {
        handlerCtx = ctx;
      },
      afterHandler: (ctx) => {
        afterCtx = ctx;
      },
    }).run(['run', '--name', 'x']);
    expect(code).toBe(0);
    expect(beforeCtx).toBe(handlerCtx);
    expect(handlerCtx).toBe(afterCtx);
    expect((beforeCtx as { options: { name: string } }).options.name).toBe('x');
  });
});
