import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { createCli, type LoadedCommand, type RuntimeCommand, type RuntimeNode } from '#index.ts';

function lazyCommand({ path, loaded }: { path: string; loaded: LoadedCommand }): RuntimeCommand {
  return { path, optionNames: [], paramNames: [], load: async () => loaded };
}

type Capture = (ctx: Record<string, unknown>) => void;

function makeTree({
  capture,
  rootCapture,
}: {
  capture: Capture;
  rootCapture?: Capture;
}): RuntimeNode {
  return {
    segment: null,
    command: rootCapture
      ? lazyCommand({
          path: '',
          loaded: { options: {}, handler: (ctx) => rootCapture(ctx as Record<string, unknown>) },
        })
      : null,
    paramChild: null,
    literalChildren: {
      run: {
        segment: { kind: 'literal', value: 'run' },
        command: {
          path: 'run',
          optionNames: [{ name: 'name', type: 'string' }],
          paramNames: [],
          load: async () => ({
            options: { name: z.string() },
            handler: (ctx) => capture(ctx as Record<string, unknown>),
          }),
        },
        literalChildren: {},
        paramChild: null,
      },
    },
  };
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

  test('object context fields are merged into ctx', async () => {
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
    expect((captured as unknown as { hello: string }).hello).toBe('world');
    // biome-ignore lint/style/noMagicNumbers: asserting numbers is idiomatic
    expect((captured as unknown as { count: number }).count).toBe(7);
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
    expect((captured as unknown as { instance: number }).instance).toBe(1);
    await cli.run(['run', '--name', 'b']);
    expect((captured as unknown as { instance: number }).instance).toBe(2);
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
    expect((captured as unknown as { from: string }).from).toBe('async');
  });

  test('context is merged into root command handler too', async () => {
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
    expect((captured as unknown as { tag: string }).tag).toBe('root');
  });
});
