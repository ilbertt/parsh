import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { generateCommandTree } from '#generate.ts';

const FIXTURES = join(import.meta.dir, 'fixtures');

function fixture(name: string) {
  return {
    commandsDir: join(FIXTURES, name, 'commands'),
    outFile: join(FIXTURES, name, 'commandTree.gen.ts'),
    coreModule: '@repo/core',
  };
}

const codegenValidationFailed = /codegen validation failed/i;

function argCollidesWithAncestor(argName: string): RegExp {
  return new RegExp(`arg '${argName}'.*collides with ancestor arg '${argName}'`, 'i');
}

function argShadowsOwnParam(name: string): RegExp {
  return new RegExp(`arg '${name}' that shadows its own param \\[${name}\\]`, 'i');
}

function paramShadowsAncestorParam(name: string): RegExp {
  return new RegExp(`param \\[${name}\\].*shadows an ancestor param \\[${name}\\]`, 'i');
}

describe('generateCommandTree', () => {
  test('basic fixture matches the expected output byte-for-byte', async () => {
    const basic = fixture('basic');
    await generateCommandTree(basic);

    const [generated, expected] = await Promise.all([
      readFile(basic.outFile, 'utf8'),
      readFile(join(FIXTURES, 'basic', 'commandTree.expected.ts'), 'utf8'),
    ]);
    expect(generated).toBe(expected);
  });

  describe('validation rules', () => {
    test('rejects same-name arg collision across ancestry', async () => {
      const run = generateCommandTree(fixture('collision-arg'));
      await expect(run).rejects.toThrow(codegenValidationFailed);
      await expect(run).rejects.toThrow(argCollidesWithAncestor('port'));
    });

    test('rejects param/arg name shadowing on the same command', async () => {
      const run = generateCommandTree(fixture('collision-param-arg'));
      await expect(run).rejects.toThrow(codegenValidationFailed);
      await expect(run).rejects.toThrow(argShadowsOwnParam('name'));
    });

    test('rejects param/param shadowing across ancestry', async () => {
      const run = generateCommandTree(fixture('collision-param-param'));
      await expect(run).rejects.toThrow(codegenValidationFailed);
      await expect(run).rejects.toThrow(paramShadowsAncestorParam('name'));
    });
  });
});
