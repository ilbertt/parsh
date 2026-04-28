import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { createCli, type RuntimeNode } from '#index.ts';
import { lazyCommand, literal, root } from './helpers/runtime-tree.ts';

type Capture = (ctx: Record<string, unknown>) => void;

function makeTree({
  capture,
  rootCapture,
}: {
  capture: Capture;
  rootCapture?: Capture;
}): RuntimeNode {
  const rootCommand = rootCapture
    ? lazyCommand({
        path: '',
        loaded: { options: {}, handler: (ctx) => rootCapture(ctx as Record<string, unknown>) },
      })
    : null;
  return root({
    command: rootCommand,
    children: {
      run: literal({
        value: 'run',
        command: lazyCommand({
          path: 'run',
          loaded: {
            options: { name: { schema: z.string() } },
            handler: (ctx) => capture(ctx as Record<string, unknown>),
          },
        }),
      }),
    },
  });
}

describe('createCli context', () => {
  test('CLI without context still works (back-compat)', async () => {
    let captured: Record<string, unknown> | null = null;
    const code = await createCli({
      programName: 't',
      tree: makeTree({
        capture: (c) => {
          captured = c;
        },
      }),
    }).run(['run', '--name', 'x']);
    expect(code).toBe(0);
    expect(captured).not.toBeNull();
    expect((captured as unknown as { options: { name: string } }).options.name).toBe('x');
  });

  test('object context is exposed under ctx.context', async () => {
    let captured: Record<string, unknown> | null = null;
    const sentinel = { hello: 'world', count: 7 };
    const code = await createCli({
      programName: 't',
      tree: makeTree({
        capture: (c) => {
          captured = c;
        },
      }),
      context: sentinel,
    }).run(['run', '--name', 'x']);
    expect(code).toBe(0);
    expect((captured as unknown as { context: { hello: string } }).context.hello).toBe('world');
    // biome-ignore lint/style/noMagicNumbers: asserting numbers is idiomatic
    expect((captured as unknown as { context: { count: number } }).context.count).toBe(7);
  });

  test('factory context produces fresh state per run', async () => {
    let calls = 0;
    let captured: Record<string, unknown> | null = null;
    const cli = createCli({
      programName: 't',
      tree: makeTree({
        capture: (c) => {
          captured = c;
        },
      }),
      context: () => ({ instance: ++calls }),
    });
    await cli.run(['run', '--name', 'a']);
    expect((captured as unknown as { context: { instance: number } }).context.instance).toBe(1);
    await cli.run(['run', '--name', 'b']);
    expect((captured as unknown as { context: { instance: number } }).context.instance).toBe(2);
    expect(calls).toBe(2);
  });

  test('async factory context is awaited before dispatch', async () => {
    let captured: Record<string, unknown> | null = null;
    const code = await createCli({
      programName: 't',
      tree: makeTree({
        capture: (c) => {
          captured = c;
        },
      }),
      context: async () => ({ from: 'async' }),
    }).run(['run', '--name', 'x']);
    expect(code).toBe(0);
    expect((captured as unknown as { context: { from: string } }).context.from).toBe('async');
  });

  test('context is exposed on the root command handler too', async () => {
    let captured: Record<string, unknown> | null = null;
    const code = await createCli({
      programName: 't',
      tree: makeTree({
        capture: () => {},
        rootCapture: (c) => {
          captured = c;
        },
      }),
      context: { tag: 'root' },
    }).run([]);
    expect(code).toBe(0);
    expect((captured as unknown as { context: { tag: string } }).context.tag).toBe('root');
  });
});
