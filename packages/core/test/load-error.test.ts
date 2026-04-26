import { describe, expect, test } from 'bun:test';
import { CommandLoadError, createCli, type RuntimeCommand, type RuntimeNode } from '#index.ts';

function badCommand(path: string): RuntimeCommand {
  return {
    path,
    optionNames: [],
    paramNames: [],
    load: () => Promise.reject(new Error('synthetic import failure')),
  };
}

describe('CommandLoadError', () => {
  test('wraps import failures with the command path', async () => {
    const tree: RuntimeNode = {
      segment: null,
      command: null,
      paramChild: null,
      literalChildren: {
        broken: {
          segment: { kind: 'literal', value: 'broken' },
          command: badCommand('broken'),
          literalChildren: {},
          paramChild: null,
        },
      },
    };

    const errors: string[] = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array) => {
      errors.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;
    try {
      const code = await createCli({ programName: 'app', tree }).run(['broken']);
      expect(code).toBe(1);
    } finally {
      process.stderr.write = origWrite;
    }

    const msg = errors.join('\n');
    expect(msg).toContain('broken');
    expect(msg).toContain('synthetic import failure');
  });

  test('CommandLoadError carries path and cause', () => {
    const cause = new Error('boom');
    const err = new CommandLoadError({ path: 'foo bar', cause });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('CommandLoadError');
    expect(err.path).toBe('foo bar');
    expect(err.cause).toBe(cause);
    expect(err.message).toContain('foo bar');
    expect(err.message).toContain('boom');
  });
});
