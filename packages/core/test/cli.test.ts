import { afterEach, beforeEach, describe, expect, type Mock, spyOn, test } from 'bun:test';
import { z } from 'zod';
import {
  createCli,
  type LoadedCommand,
  type OptionMeta,
  type RuntimeCommand,
  type RuntimeNode,
} from '#index.ts';

let stderrSpy: Mock<typeof process.stderr.write>;
let stdoutSpy: Mock<typeof process.stdout.write>;

beforeEach(() => {
  stderrSpy = spyOn(process.stderr, 'write').mockImplementation(() => true);
  stdoutSpy = spyOn(process.stdout, 'write').mockImplementation(() => true);
});

afterEach(() => {
  stderrSpy.mockRestore();
  stdoutSpy.mockRestore();
});

function stderrText(): string {
  return stderrSpy.mock.calls.flat().map(String).join('\n').toLowerCase();
}

function stdoutText(): string {
  return stdoutSpy.mock.calls.flat().map(String).join('\n');
}

type Ctx = {
  options: Record<string, unknown>;
  params: Record<string, unknown>;
  parents: Record<string, { options: Record<string, unknown>; params: Record<string, unknown> }>;
  rootOptions: Record<string, unknown>;
};

type Called = { path: string; ctx: Ctx };

function lazyCommand({
  path,
  optionNames,
  paramNames,
  loaded,
}: {
  path: string;
  optionNames: ReadonlyArray<OptionMeta>;
  paramNames: ReadonlyArray<string>;
  loaded: LoadedCommand;
}): RuntimeCommand {
  return {
    path,
    optionNames,
    paramNames,
    load: async () => loaded,
  };
}

function makeTree(opts: {
  calls: Called[];
  idSchema: () => z.ZodType<string | number>;
}): RuntimeNode {
  const record = (path: string) => (ctx: Ctx) => {
    opts.calls.push({ path, ctx });
  };

  return {
    segment: null,
    command: lazyCommand({
      path: '',
      optionNames: [{ name: 'verbose', type: 'boolean' }],
      paramNames: [],
      loaded: {
        options: {
          verbose: { schema: z.boolean().default(false), forwardToChildren: true },
        },
      },
    }),
    paramChild: null,
    literalChildren: {
      deploy: {
        segment: { kind: 'literal', value: 'deploy' },
        command: lazyCommand({
          path: 'deploy',
          optionNames: [{ name: 'env', type: 'string' }],
          paramNames: [],
          loaded: {
            options: { env: { schema: z.enum(['staging', 'prod']) } },
            handler: record('deploy'),
          },
        }),
        literalChildren: {},
        paramChild: null,
      },
      users: {
        segment: { kind: 'literal', value: 'users' },
        command: lazyCommand({
          path: 'users',
          optionNames: [{ name: 'workspace', type: 'string' }],
          paramNames: [],
          loaded: {
            options: { workspace: { schema: z.string(), forwardToChildren: true } },
            handler: record('users'),
          },
        }),
        literalChildren: {
          create: {
            segment: { kind: 'literal', value: 'create' },
            command: lazyCommand({
              path: 'users create',
              optionNames: [{ name: 'email', type: 'string' }],
              paramNames: [],
              loaded: {
                options: { email: { schema: z.string() } },
                handler: record('users create'),
              },
            }),
            literalChildren: {},
            paramChild: null,
          },
        },
        paramChild: {
          segment: { kind: 'param', name: 'id' },
          command: lazyCommand({
            path: 'users [id]',
            optionNames: [],
            paramNames: ['id'],
            loaded: {
              options: {},
              params: { id: { schema: opts.idSchema() } },
              handler: () => {},
            },
          }),
          literalChildren: {
            edit: {
              segment: { kind: 'literal', value: 'edit' },
              command: lazyCommand({
                path: 'users [id] edit',
                optionNames: [],
                paramNames: [],
                loaded: { options: {}, handler: record('users [id] edit') },
              }),
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
  test('own options populate ctx.options; root options populate ctx.rootOptions', async () => {
    const calls: Called[] = [];
    const code = await makeCli({ calls }).run(['deploy', '--env', 'prod']);

    expect(code).toBe(0);
    expect(calls[0]?.ctx.options).toEqual({ env: 'prod' });
    expect(calls[0]?.ctx.rootOptions).toEqual({ verbose: false });
  });

  test('lifts a bare boolean flag to true', async () => {
    const calls: Called[] = [];
    const code = await makeCli({ calls }).run(['deploy', '--env', 'prod', '--verbose']);

    expect(code).toBe(0);
    expect(calls[0]?.ctx.rootOptions.verbose).toBe(true);
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
    expect(calls[0]?.ctx.rootOptions).toEqual({ verbose: false });
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

describe('option aliases', () => {
  function aliasTree({ calls }: { calls: Called[] }): RuntimeNode {
    const record = (path: string) => (ctx: Ctx) => {
      calls.push({ path, ctx });
    };
    return {
      segment: null,
      command: lazyCommand({
        path: '',
        optionNames: [
          { name: 'verbose', type: 'boolean', forwardToChildren: true, aliases: ['v'] },
        ],
        paramNames: [],
        loaded: {
          options: {
            verbose: {
              schema: z.boolean().default(false),
              forwardToChildren: true,
              aliases: ['v'],
            },
          },
        },
      }),
      paramChild: null,
      literalChildren: {
        deploy: {
          segment: { kind: 'literal', value: 'deploy' },
          command: lazyCommand({
            path: 'deploy',
            optionNames: [{ name: 'env', type: 'string', aliases: ['e', 'environment'] }],
            paramNames: [],
            loaded: {
              options: {
                env: { schema: z.enum(['staging', 'prod']), aliases: ['e', 'environment'] },
              },
              handler: record('deploy'),
            },
          }),
          literalChildren: {},
          paramChild: null,
        },
      },
    };
  }

  test('short alias -e maps to canonical --env', async () => {
    const calls: Called[] = [];
    const code = await createCli({ programName: 't', tree: aliasTree({ calls }) }).run([
      'deploy',
      '-e',
      'prod',
    ]);
    expect(code).toBe(0);
    expect(calls[0]?.ctx.options).toEqual({ env: 'prod' });
  });

  test('long alias --environment=prod maps to canonical --env', async () => {
    const calls: Called[] = [];
    const code = await createCli({ programName: 't', tree: aliasTree({ calls }) }).run([
      'deploy',
      '--environment=prod',
    ]);
    expect(code).toBe(0);
    expect(calls[0]?.ctx.options).toEqual({ env: 'prod' });
  });

  test('forwarded alias -v on root reaches descendant', async () => {
    const calls: Called[] = [];
    const code = await createCli({ programName: 't', tree: aliasTree({ calls }) }).run([
      'deploy',
      '--env',
      'prod',
      '-v',
    ]);
    expect(code).toBe(0);
    expect(calls[0]?.ctx.rootOptions).toEqual({ verbose: true });
  });

  test('alias colliding with another option name throws at construction', () => {
    const tree: RuntimeNode = {
      segment: null,
      command: lazyCommand({
        path: '',
        optionNames: [
          { name: 'verbose', type: 'boolean', forwardToChildren: true },
          { name: 'version', type: 'boolean', aliases: ['verbose'] },
        ],
        paramNames: [],
        loaded: { options: {} },
      }),
      paramChild: null,
      literalChildren: {},
    };
    expect(() => createCli({ programName: 't', tree })).toThrow(/collides/i);
  });

  test('alias colliding with forwarded ancestor option throws', () => {
    const tree: RuntimeNode = {
      segment: null,
      command: lazyCommand({
        path: '',
        optionNames: [
          { name: 'verbose', type: 'boolean', forwardToChildren: true, aliases: ['v'] },
        ],
        paramNames: [],
        loaded: { options: {} },
      }),
      paramChild: null,
      literalChildren: {
        leaf: {
          segment: { kind: 'literal', value: 'leaf' },
          command: lazyCommand({
            path: 'leaf',
            optionNames: [{ name: 'volume', type: 'string', aliases: ['v'] }],
            paramNames: [],
            loaded: { options: {} },
          }),
          literalChildren: {},
          paramChild: null,
        },
      },
    };
    expect(() => createCli({ programName: 't', tree })).toThrow(/collides/i);
  });
});

function routingTree(opts: { calls: Called[] }): RuntimeNode {
  return {
    segment: null,
    command: null,
    paramChild: null,
    literalChildren: {
      sub: {
        segment: { kind: 'literal', value: 'sub' },
        command: lazyCommand({
          path: 'sub',
          optionNames: [],
          paramNames: [],
          loaded: {
            options: {},
            handler: (ctx: Ctx) => {
              opts.calls.push({ path: 'sub', ctx });
            },
          },
        }),
        literalChildren: {},
        paramChild: null,
      },
    },
  };
}

describe('--version', () => {
  test('prints the version and exits 0 at the root', async () => {
    const cli = createCli({
      programName: 'test',
      tree: makeTree({ calls: [], idSchema: z.string }),
      version: '1.2.3',
    });
    const code = await cli.run(['--version']);

    expect(code).toBe(0);
    expect(stdoutText()).toBe('1.2.3\n');
  });

  test('-V alias prints the version', async () => {
    const cli = createCli({
      programName: 'test',
      tree: makeTree({ calls: [], idSchema: z.string }),
      version: '1.2.3',
    });
    const code = await cli.run(['-V']);

    expect(code).toBe(0);
    expect(stdoutText()).toBe('1.2.3\n');
  });

  test('falls through when --version comes after a subcommand', async () => {
    const calls: Called[] = [];
    const cli = createCli({
      programName: 'test',
      tree: makeTree({ calls, idSchema: z.string }),
      version: '1.2.3',
    });
    const code = await cli.run(['deploy', '--env', 'prod', '--version']);

    expect(code).toBe(0);
    expect(stdoutText()).not.toContain('1.2.3');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.path).toBe('deploy');
  });

  test('does not intercept --version when no version is configured', async () => {
    const cli = createCli({
      programName: 'test',
      tree: makeTree({ calls: [], idSchema: z.string }),
    });
    const code = await cli.run(['--version']);

    expect(stdoutText()).not.toContain('1.2.3');
    expect(code).toBe(0);
  });
});

describe('root --help Options block', () => {
  test('lists --help, -h', async () => {
    const cli = createCli({
      programName: 'test',
      tree: makeTree({ calls: [], idSchema: z.string }),
    });
    await cli.run(['--help']);

    expect(stdoutText()).toContain('--help, -h');
  });

  test('lists --version, -V when version is set', async () => {
    const cli = createCli({
      programName: 'test',
      tree: makeTree({ calls: [], idSchema: z.string }),
      version: '1.2.3',
    });
    await cli.run(['--help']);

    expect(stdoutText()).toContain('--version, -V');
  });

  test('omits --version, -V when no version is configured', async () => {
    const cli = createCli({
      programName: 'test',
      tree: makeTree({ calls: [], idSchema: z.string }),
    });
    await cli.run(['--help']);

    expect(stdoutText()).not.toContain('--version');
  });

  test('renders Options block even when the root has no user-defined options', async () => {
    const cli = createCli({
      programName: 'test',
      tree: routingTree({ calls: [] }),
    });
    await cli.run(['--help']);

    const out = stdoutText();
    expect(out).toContain('Options:');
    expect(out).toContain('--help, -h');
  });
});
