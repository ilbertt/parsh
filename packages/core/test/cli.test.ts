import { afterEach, beforeEach, describe, expect, type Mock, spyOn, test } from 'bun:test';
import { z } from 'zod';
import { createCli, type RuntimeCommand, type RuntimeNode } from '#index.ts';

let stderrSpy: Mock<typeof console.error>;

beforeEach(() => {
  stderrSpy = spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  stderrSpy.mockRestore();
});

function stderrText(): string {
  return stderrSpy.mock.calls.flat().map(String).join('\n').toLowerCase();
}

type Ctx = {
  options: Record<string, unknown>;
  params: Record<string, unknown>;
  parents: Record<string, { options: Record<string, unknown>; params: Record<string, unknown> }>;
  root: { options: Record<string, unknown> };
};

type Called = { path: string; ctx: Ctx };

function makeTree(opts: {
  calls: Called[];
  idSchema: () => z.ZodType<string | number>;
}): RuntimeNode {
  const record = (path: string) => (ctx: Ctx) => {
    opts.calls.push({ path, ctx });
  };

  return {
    segment: null,
    command: {
      path: '',
      options: { verbose: z.boolean().default(false) },
    } satisfies RuntimeCommand,
    paramChild: null,
    literalChildren: {
      deploy: {
        segment: { kind: 'literal', value: 'deploy' },
        command: {
          path: 'deploy',
          options: { env: z.enum(['staging', 'prod']) },
          handler: record('deploy'),
        } satisfies RuntimeCommand,
        literalChildren: {},
        paramChild: null,
      },
      users: {
        segment: { kind: 'literal', value: 'users' },
        command: {
          path: 'users',
          options: { workspace: z.string() },
          handler: record('users'),
        } satisfies RuntimeCommand,
        literalChildren: {
          create: {
            segment: { kind: 'literal', value: 'create' },
            command: {
              path: 'users create',
              options: { email: z.string() },
              handler: record('users create'),
            } satisfies RuntimeCommand,
            literalChildren: {},
            paramChild: null,
          },
        },
        paramChild: {
          segment: { kind: 'param', name: 'id' },
          command: {
            path: 'users [id]',
            options: {},
            params: { id: opts.idSchema() },
            handler: () => {},
          } satisfies RuntimeCommand,
          literalChildren: {
            edit: {
              segment: { kind: 'literal', value: 'edit' },
              command: {
                path: 'users [id] edit',
                options: {},
                handler: record('users [id] edit'),
              } satisfies RuntimeCommand,
              literalChildren: {},
              paramChild: null,
            },
          },
          paramChild: null,
        },
      },
    },
  };
}

function makeCli(opts: { calls: Called[]; idSchema?: () => z.ZodType<string | number> }) {
  return createCli({
    programName: 'test',
    tree: makeTree({
      calls: opts.calls,
      idSchema: opts.idSchema ?? z.string,
    }),
  });
}

describe('argument parsing', () => {
  test('own options populate ctx.options; root options populate ctx.root.options', async () => {
    const calls: Called[] = [];
    const code = await makeCli({ calls }).run(['deploy', '--env', 'prod']);

    expect(code).toBe(0);
    expect(calls[0]?.ctx.options).toEqual({ env: 'prod' });
    expect(calls[0]?.ctx.root.options).toEqual({ verbose: false });
  });

  test('lifts a bare boolean flag to true', async () => {
    const calls: Called[] = [];
    const code = await makeCli({ calls }).run(['deploy', '--env', 'prod', '--verbose']);

    expect(code).toBe(0);
    expect(calls[0]?.ctx.root.options.verbose).toBe(true);
  });

  test('ancestor options land in ctx.parents[path].options', async () => {
    const calls: Called[] = [];
    const code = await makeCli({ calls }).run([
      'users',
      '--workspace',
      'acme',
      'create',
      '--email',
      'a@b.com',
    ]);

    expect(code).toBe(0);
    expect(calls[0]?.ctx.options).toEqual({ email: 'a@b.com' });
    expect(calls[0]?.ctx.parents.users?.options).toEqual({ workspace: 'acme' });
    expect(calls[0]?.ctx.root.options).toEqual({ verbose: false });
  });
});

describe('validation failures', () => {
  test('missing required own option exits 2 and surfaces the option name', async () => {
    const calls: Called[] = [];
    const code = await makeCli({ calls }).run(['deploy']);

    expect(code).toBe(2);
    expect(calls).toBeEmpty();
    expect(stderrText()).toContain('env');
  });

  test('missing required ancestor option exits 2', async () => {
    const calls: Called[] = [];
    const code = await makeCli({ calls }).run(['users', 'create', '--email', 'a@b.com']);

    expect(code).toBe(2);
    expect(calls).toBeEmpty();
  });

  test('unknown top-level command exits 2 with "unknown command"', async () => {
    const calls: Called[] = [];
    const code = await makeCli({ calls }).run(['bogus']);

    expect(code).toBe(2);
    expect(stderrText()).toContain('unknown command');
  });
});

describe('param capture', () => {
  test('ancestor dynamic segment lands in ctx.parents[path].params', async () => {
    const calls: Called[] = [];
    const code = await makeCli({ calls }).run(['users', '--workspace', 'x', '123', 'edit']);

    expect(code).toBe(0);
    expect(calls[0]?.path).toBe('users [id] edit');
    expect(calls[0]?.ctx.parents['users [id]']?.params).toEqual({ id: '123' });
  });

  test('rejects a param value that fails its schema', async () => {
    const calls: Called[] = [];
    const code = await makeCli({ calls, idSchema: () => z.coerce.number() }).run([
      'users',
      '--workspace',
      'x',
      'abc',
      'edit',
    ]);

    expect(code).toBe(2);
    expect(calls).toBeEmpty();
    expect(stderrText()).toContain('id');
  });
});

describe('direct handler invocation', () => {
  test('handler is callable with a hand-built ctx (no router)', async () => {
    const calls: Called[] = [];
    const tree = makeTree({ calls, idSchema: () => z.string() });
    const deployCmd = tree.literalChildren.deploy!.command!;

    await deployCmd.handler!({
      options: { env: 'prod' },
      params: {},
      parents: {},
      root: { options: { verbose: false } },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.ctx.options).toEqual({ env: 'prod' });
  });
});
