/** biome-ignore-all lint/style/noMagicNumbers: exit codes in tests are intentional literals */
import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import {
  CommandLoadError,
  createCli,
  ExitSignal,
  type RuntimeCommand,
  type RuntimeNode,
} from '#index.ts';
import { lazyCommand, literal, param, root } from './helpers/runtime-tree.ts';
import { captureStdio } from './helpers/stdio.ts';

class NotLoggedIn extends Error {}

const { stderrText, stdoutText } = captureStdio();

function makeTreeWithThrowingHandler(thrown: unknown): RuntimeNode {
  return root({
    command: null,
    children: {
      run: literal({
        value: 'run',
        command: lazyCommand({
          path: 'run',
          loaded: {
            options: {},
            handler: () => {
              throw thrown;
            },
          },
        }),
      }),
    },
  });
}

function makeValidationTree(): RuntimeNode {
  return root({
    command: null,
    children: {
      go: literal({
        value: 'go',
        command: lazyCommand({
          path: 'go',
          optionNames: [{ name: 'count', type: 'string' }],
          loaded: {
            options: { count: { schema: z.number() } },
            handler: () => {},
          },
        }),
      }),
    },
  });
}

function makeParamValidationTree(): RuntimeNode {
  return root({
    command: null,
    children: {
      pick: literal({
        value: 'pick',
        paramChild: param({
          name: 'count',
          command: lazyCommand({
            path: 'pick [count]',
            paramNames: ['count'],
            loaded: {
              params: { count: { schema: z.number() } },
              options: {},
              handler: () => {},
            },
          }),
        }),
        command: null,
      }),
    },
  });
}

function makeLoadErrorTree(): RuntimeNode {
  const broken: RuntimeCommand = {
    path: 'broken',
    optionNames: [],
    paramNames: [],
    load: () => Promise.reject(new Error('synthetic import failure')),
  };
  return root({
    command: null,
    children: { broken: literal({ value: 'broken', command: broken }) },
  });
}

describe('onError — registered handler errors', () => {
  test('routes a registered error class to the object key as code', async () => {
    const seen: Array<{ code: string; isInstance: boolean }> = [];
    const cli = createCli({
      programName: 'app',
      tree: makeTreeWithThrowingHandler(new NotLoggedIn('nope')),
      errors: { NotLoggedIn },
      onError: ({ code, error, exit }) => {
        seen.push({ code, isInstance: error instanceof NotLoggedIn });
        if (code === 'NotLoggedIn') {
          return exit(77);
        }
      },
    });
    const exitCode = await cli.run(['run']);
    expect(seen).toEqual([{ code: 'NotLoggedIn', isInstance: true }]);
    expect(exitCode).toBe(77);
    expect(stderrText()).toBe('');
  });

  test('UNKNOWN code for unregistered handler errors, ctx is provided', async () => {
    const observed: Array<{
      code: string;
      message: string;
      isError: boolean;
      ctxOptions: unknown;
    }> = [];
    const cli = createCli({
      programName: 'app',
      tree: makeTreeWithThrowingHandler('oops-string-throw'),
      onError: (payload) => {
        observed.push({
          code: payload.code,
          message: payload.code === 'UNKNOWN' ? payload.error.message : '',
          isError: payload.code === 'UNKNOWN' ? payload.error instanceof Error : false,
          ctxOptions: payload.ctx?.options,
        });
      },
    });
    const exitCode = await cli.run(['run']);
    expect(exitCode).toBe(1);
    expect(observed).toEqual([
      { code: 'UNKNOWN', message: 'oops-string-throw', isError: true, ctxOptions: {} },
    ]);
  });

  test('first match wins (registration order)', async () => {
    class Parent extends Error {}
    class Child extends Error {}
    Object.setPrototypeOf(Child.prototype, Parent.prototype);

    const codes: string[] = [];

    await createCli({
      programName: 'a',
      tree: makeTreeWithThrowingHandler(new Child('c')),
      errors: { Child, Parent },
      onError: ({ code, exit }) => {
        codes.push(code);
        return exit(0);
      },
    }).run(['run']);

    await createCli({
      programName: 'b',
      tree: makeTreeWithThrowingHandler(new Child('c')),
      errors: { Parent, Child },
      onError: ({ code, exit }) => {
        codes.push(code);
        return exit(0);
      },
    }).run(['run']);

    expect(codes).toEqual(['Child', 'Parent']);
  });

  test('handler ctx is the same shape the handler saw', async () => {
    const seen: Array<{ options: unknown; params: unknown; rootOptions: unknown }> = [];
    const cli = createCli({
      programName: 'app',
      tree: root({
        command: null,
        children: {
          run: literal({
            value: 'run',
            command: lazyCommand({
              path: 'run',
              optionNames: [{ name: 'flag', type: 'boolean' }],
              loaded: {
                options: { flag: { schema: z.boolean().default(false) } },
                handler: () => {
                  throw new NotLoggedIn('x');
                },
              },
            }),
          }),
        },
      }),
      errors: { NotLoggedIn },
      onError: ({ ctx, exit }) => {
        if (ctx) {
          seen.push({ options: ctx.options, params: ctx.params, rootOptions: ctx.rootOptions });
        }
        return exit(0);
      },
    });
    await cli.run(['run', '--flag']);
    expect(seen).toEqual([{ options: { flag: true }, params: {}, rootOptions: {} }]);
  });
});

describe('onError — pre-handler sites', () => {
  test('PARSE: unknown command routes through onError', async () => {
    const codes: string[] = [];
    const tree = root({
      command: null,
      children: {
        known: literal({
          value: 'known',
          command: lazyCommand({
            path: 'known',
            loaded: { options: {}, handler: () => {} },
          }),
        }),
      },
    });
    const cli = createCli({
      programName: 'app',
      tree,
      onError: ({ code, exit }) => {
        codes.push(code);
        return exit(9);
      },
    });
    const exitCode = await cli.run(['unknown-cmd']);
    expect(codes).toEqual(['PARSE']);
    expect(exitCode).toBe(9);
    expect(stderrText()).toBe('');
  });

  test('VALIDATION (option): missing required + ctx undefined', async () => {
    const seen: Array<{ code: string; ctx: unknown }> = [];
    const cli = createCli({
      programName: 'app',
      tree: makeValidationTree(),
      onError: (payload) => {
        seen.push({ code: payload.code, ctx: payload.ctx });
        return payload.exit(8);
      },
    });
    const exitCode = await cli.run(['go']);
    expect(seen).toEqual([{ code: 'VALIDATION', ctx: undefined }]);
    expect(exitCode).toBe(8);
  });

  test('VALIDATION (param): bad param value', async () => {
    const codes: string[] = [];
    const cli = createCli({
      programName: 'app',
      tree: makeParamValidationTree(),
      onError: ({ code, exit }) => {
        codes.push(code);
        return exit(8);
      },
    });
    const exitCode = await cli.run(['pick', 'not-a-number']);
    expect(codes).toEqual(['VALIDATION']);
    expect(exitCode).toBe(8);
  });

  test('LOAD: failed import routes with CommandLoadError', async () => {
    const seen: Array<{ code: string; isInstance: boolean }> = [];
    const cli = createCli({
      programName: 'app',
      tree: makeLoadErrorTree(),
      onError: ({ code, error, exit }) => {
        seen.push({ code, isInstance: error instanceof CommandLoadError });
        return exit(11);
      },
    });
    const exitCode = await cli.run(['broken']);
    expect(seen).toEqual([{ code: 'LOAD', isInstance: true }]);
    expect(exitCode).toBe(11);
  });
});

describe('onError — exit semantics', () => {
  test('returning void falls through to default rendering', async () => {
    const cli = createCli({
      programName: 'app',
      tree: makeTreeWithThrowingHandler(new Error('boom')),
      onError: () => {
        // fall through
      },
    });
    const exitCode = await cli.run(['run']);
    expect(exitCode).toBe(1);
    expect(stderrText()).toContain('app');
    expect(stderrText()).toContain('boom');
  });

  test('returning exit() suppresses default stderr', async () => {
    const cli = createCli({
      programName: 'app',
      tree: makeTreeWithThrowingHandler(new Error('hidden')),
      onError: ({ exit }) => exit(42),
    });
    const exitCode = await cli.run(['run']);
    expect(exitCode).toBe(42);
    expect(stderrText()).toBe('');
    expect(stdoutText()).toBe('');
  });

  test('async onError returning exit', async () => {
    const cli = createCli({
      programName: 'app',
      tree: makeTreeWithThrowingHandler(new Error('boom')),
      onError: async ({ exit }) => {
        await new Promise((r) => setTimeout(r, 1));
        return exit(3);
      },
    });
    expect(await cli.run(['run'])).toBe(3);
    expect(stderrText()).toBe('');
  });

  test('onError throwing → exit 1, no recursion', async () => {
    const cli = createCli({
      programName: 'app',
      tree: makeTreeWithThrowingHandler(new Error('original')),
      onError: () => {
        throw new Error('handler-bug');
      },
    });
    const exitCode = await cli.run(['run']);
    expect(exitCode).toBe(1);
    expect(stderrText()).toContain('onError threw');
    expect(stderrText()).toContain('handler-bug');
  });

  test('exit() returns an ExitSignal instance', () => {
    const sig = new ExitSignal(5);
    expect(sig).toBeInstanceOf(ExitSignal);
    expect(sig.code).toBe(5);
  });
});

describe('onError — no-onError baseline (regression)', () => {
  test('handler error → exit 1, default stderr unchanged', async () => {
    const cli = createCli({
      programName: 'app',
      tree: makeTreeWithThrowingHandler(new Error('boom')),
    });
    const exitCode = await cli.run(['run']);
    expect(exitCode).toBe(1);
    expect(stderrText()).toMatch(/app.*: boom/);
  });

  test('LOAD without onError still writes prefixed message + exit 1', async () => {
    const cli = createCli({ programName: 'app', tree: makeLoadErrorTree() });
    const exitCode = await cli.run(['broken']);
    expect(exitCode).toBe(1);
    expect(stderrText()).toContain('synthetic import failure');
  });

  test('VALIDATION without onError keeps helpHint suffix', async () => {
    const cli = createCli({ programName: 'app', tree: makeValidationTree() });
    const exitCode = await cli.run(['go']);
    expect(exitCode).toBe(2);
    expect(stderrText()).toContain('--help');
  });

  test('unknown command without onError → exit 2 with default message', async () => {
    const tree = root({
      command: null,
      children: {
        known: literal({
          value: 'known',
          command: lazyCommand({
            path: 'known',
            loaded: { options: {}, handler: () => {} },
          }),
        }),
      },
    });
    const cli = createCli({ programName: 'app', tree });
    const exitCode = await cli.run(['unknown-cmd']);
    expect(exitCode).toBe(2);
    expect(stderrText()).toContain('unknown command');
  });
});
