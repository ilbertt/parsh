import { afterEach, beforeEach, describe, expect, type Mock, spyOn, test } from 'bun:test';
import { z } from 'zod';
import { createCLI, type RuntimeCommand, type RuntimeNode } from '#index.ts';

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

type Called = { path: string; args: Record<string, unknown>; params: Record<string, unknown> };

function makeTree(opts: {
  calls: Called[];
  idSchema: () => z.ZodType<string | number>;
}): RuntimeNode {
  const deployCmd: RuntimeCommand = {
    path: 'deploy',
    args: { env: z.enum(['staging', 'prod']) },
    handler: (ctx) => {
      opts.calls.push({ path: 'deploy', args: ctx.args, params: ctx.params });
    },
  };
  const usersCmd: RuntimeCommand = {
    path: 'users',
    args: { workspace: z.string() },
    handler: (ctx) => {
      opts.calls.push({ path: 'users', args: ctx.args, params: ctx.params });
    },
  };
  const usersCreateCmd: RuntimeCommand = {
    path: 'users create',
    args: { email: z.string() },
    handler: (ctx) => {
      opts.calls.push({ path: 'users create', args: ctx.args, params: ctx.params });
    },
  };
  const usersIdCmd: RuntimeCommand = {
    path: 'users [id]',
    args: {},
    params: { id: opts.idSchema() },
    handler: () => {},
  };
  const usersIdEditCmd: RuntimeCommand = {
    path: 'users [id] edit',
    args: {},
    handler: (ctx) => {
      opts.calls.push({ path: 'users [id] edit', args: ctx.args, params: ctx.params });
    },
  };
  return {
    segment: null,
    command: null,
    paramChild: null,
    literalChildren: {
      deploy: {
        segment: { kind: 'literal', value: 'deploy' },
        command: deployCmd,
        literalChildren: {},
        paramChild: null,
      },
      users: {
        segment: { kind: 'literal', value: 'users' },
        command: usersCmd,
        literalChildren: {
          create: {
            segment: { kind: 'literal', value: 'create' },
            command: usersCreateCmd,
            literalChildren: {},
            paramChild: null,
          },
        },
        paramChild: {
          segment: { kind: 'param', name: 'id' },
          command: usersIdCmd,
          literalChildren: {
            edit: {
              segment: { kind: 'literal', value: 'edit' },
              command: usersIdEditCmd,
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
  return createCLI({
    tree: makeTree({
      calls: opts.calls,
      idSchema: opts.idSchema ?? z.string,
    }),
    args: { verbose: z.boolean().default(false) },
  });
}

describe('argument parsing', () => {
  test('parses a required string flag and fills a defaulted boolean', async () => {
    const calls: Called[] = [];
    const code = await makeCli({ calls }).run(['deploy', '--env', 'prod']);

    expect(code).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      path: 'deploy',
      args: { env: 'prod', verbose: false },
    });
  });

  test('lifts a bare boolean flag to true', async () => {
    const calls: Called[] = [];
    const code = await makeCli({ calls }).run(['deploy', '--env', 'prod', '--verbose']);

    expect(code).toBe(0);
    expect(calls[0]?.args.verbose).toBe(true);
  });

  test('accepts flags at any position, across subcommand boundaries', async () => {
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
    expect(calls[0]).toMatchObject({
      path: 'users create',
      args: { email: 'a@b.com', workspace: 'acme', verbose: false },
    });
  });
});

describe('validation failures', () => {
  test('missing required arg exits 2 and surfaces the arg name', async () => {
    const calls: Called[] = [];
    const code = await makeCli({ calls }).run(['deploy']);

    expect(code).toBe(2);
    expect(calls).toBeEmpty();
    expect(stderrText()).toContain('env');
  });

  test('missing inherited arg exits 2', async () => {
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
  test('captures a dynamic segment as a string param', async () => {
    const calls: Called[] = [];
    const code = await makeCli({ calls }).run(['users', '--workspace', 'x', '123', 'edit']);

    expect(code).toBe(0);
    expect(calls[0]).toMatchObject({
      path: 'users [id] edit',
      params: { id: '123' },
    });
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
      args: { env: 'prod', verbose: false },
      params: {},
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.args.env).toBe('prod');
  });
});
