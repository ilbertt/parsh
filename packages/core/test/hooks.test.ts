import { afterEach, beforeEach, describe, expect, type Mock, spyOn, test } from 'bun:test';
import { z } from 'zod';
import { createCli, type LoadedCommand, type RuntimeCommand, type RuntimeNode } from '#index.ts';

let stderrSpy: Mock<typeof console.error>;

beforeEach(() => {
  stderrSpy = spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  stderrSpy.mockRestore();
});

function stderrText(): string {
  return stderrSpy.mock.calls.flat().map(String).join('\n');
}

function makeCli(loaded: LoadedCommand) {
  const command: RuntimeCommand = {
    path: 'run',
    optionNames: [{ name: 'name', type: 'string' }],
    paramNames: [],
    load: async () => loaded,
  };
  const tree: RuntimeNode = {
    segment: null,
    command: null,
    paramChild: null,
    literalChildren: {
      run: {
        segment: { kind: 'literal', value: 'run' },
        command,
        literalChildren: {},
        paramChild: null,
      },
    },
  };
  return createCli({ programName: 't', tree });
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
