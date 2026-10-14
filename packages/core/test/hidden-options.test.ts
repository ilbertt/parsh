import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { createCli, type LoadedCommand } from '#index.ts';
import { type Called, lazyCommand, literal, record, root } from './helpers/runtime-tree.ts';
import { captureStdio } from './helpers/stdio.ts';

const { stdoutText, stderrText } = captureStdio();

function makeCli({ calls, ownOptions }: { calls: Called[]; ownOptions: LoadedCommand['options'] }) {
  return createCli({
    programName: 'test',
    tree: root({
      command: lazyCommand({
        path: '',
        loaded: {
          options: {
            internalRoot: {
              schema: z.boolean().default(false),
              hidden: true,
              forwardToChildren: true,
              aliases: ['r'],
              description: 'Root internals',
            },
            verbose: { schema: z.boolean().default(false), forwardToChildren: true },
          },
          handler: record({ calls, path: '' }),
        },
      }),
      children: {
        group: literal({
          value: 'group',
          command: lazyCommand({
            path: 'group',
            loaded: {
              options: {
                internalParent: {
                  schema: z.string().default('default'),
                  hidden: true,
                  forwardToChildren: true,
                  aliases: ['p'],
                  description: 'Parent internals',
                },
                format: { schema: z.string().optional(), forwardToChildren: true },
              },
            },
          }),
          children: {
            leaf: literal({
              value: 'leaf',
              command: lazyCommand({
                path: 'group leaf',
                loaded: { options: ownOptions, handler: record({ calls, path: 'group leaf' }) },
              }),
            }),
          },
        }),
      },
    }),
  });
}

const ownOptions = {
  internalOwn: { schema: z.string().optional(), hidden: true, aliases: ['i'] },
  output: { schema: z.string().optional(), aliases: ['o'] },
};

describe('hidden options', () => {
  test.each(['', 'group', 'group leaf'])(
    'omits hidden flags from help at "%s"',
    async (commandPath) => {
      const path = commandPath ? commandPath.split(' ') : [];
      const cli = makeCli({ calls: [], ownOptions });
      expect(await cli.run([...path, '--help'])).toBe(0);
      const output = stdoutText();
      expect(output).not.toContain('internal');
      expect(output).not.toContain('internals');
      expect(output).not.toContain('-r');
      expect(output).not.toContain('-p');
      expect(output).not.toContain('-i');
      expect(output).toContain('--verbose');
      if (path.length > 0) {
        expect(output).toContain('--format');
      }
      if (path.length > 1) {
        expect(output).toContain('--output, -o');
      }
    },
  );

  test.each(['--internalRoot', '-r'])('parses hidden root flag %s', async (flag) => {
    const calls: Called[] = [];
    expect(await makeCli({ calls, ownOptions }).run([flag])).toBe(0);
    expect(calls[0]?.ctx.options).toEqual({ internalRoot: true, verbose: false });
  });

  test('parses hidden own and forwarded aliases alongside visible flags', async () => {
    const calls: Called[] = [];
    const cli = makeCli({ calls, ownOptions });
    expect(
      await cli.run(['group', 'leaf', '-r', '-p', 'parent', '-i', 'own', '-o', 'stdout']),
    ).toBe(0);
    expect(calls[0]?.ctx.options).toEqual({ internalOwn: 'own', output: 'stdout' });
    expect(calls[0]?.ctx.rootOptions).toEqual({ internalRoot: true, verbose: false });
    expect(calls[0]?.ctx.parents.group?.options).toEqual({
      internalParent: 'parent',
      format: undefined,
    });
  });

  test('retains hidden option defaults', async () => {
    const calls: Called[] = [];
    expect(await makeCli({ calls, ownOptions }).run(['group', 'leaf'])).toBe(0);
    expect(calls[0]?.ctx.rootOptions.internalRoot).toBe(false);
    expect(calls[0]?.ctx.parents.group?.options.internalParent).toBe('default');
  });

  test('enforces hidden required options and their schemas', async () => {
    const calls: Called[] = [];
    const cli = makeCli({
      calls,
      ownOptions: { token: { schema: z.enum(['valid']), required: true, hidden: true } },
    });
    expect(await cli.run(['group', 'leaf'])).toBe(2);
    expect(stderrText()).toContain('token');
    expect(await cli.run(['group', 'leaf', '--token', 'invalid'])).toBe(2);
    expect(calls).toHaveLength(0);
    expect(await cli.run(['group', 'leaf', '--token', 'valid'])).toBe(0);
    expect(calls[0]?.ctx.options.token).toBe('valid');
  });
});
