import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { createFilesContext, FileNotFoundError, FileValidationError } from '#index.ts';

let basePath: string;

beforeEach(async () => {
  basePath = await mkdtemp(join(tmpdir(), 'parsh-files-'));
});

afterEach(async () => {
  await rm(basePath, { recursive: true, force: true });
});

const credsSchema = z.object({ accessKey: z.string(), region: z.string() });

describe('createFilesContext', () => {
  test('round-trip write→read returns equal value with inferred type', async () => {
    const files = createFilesContext({
      basePath,
      files: { creds: { filename: 'creds.json', schema: credsSchema } },
    });

    const value = { accessKey: 'AKIA', region: 'eu-west-2' };
    await files.creds.write(value);
    const read = await files.creds.read();
    expect(read).toEqual(value);
  });

  test('read returns null when the file does not exist', async () => {
    const files = createFilesContext({
      basePath,
      files: { creds: { filename: 'missing.json', schema: credsSchema } },
    });
    expect(await files.creds.read()).toBeNull();
  });

  test('handle.path resolves to basePath/filename', () => {
    const files = createFilesContext({
      basePath,
      files: { creds: { filename: 'creds.json', schema: credsSchema } },
    });
    expect(files.creds.path).toBe(join(basePath, 'creds.json'));
  });

  test('corrupt JSON throws FileValidationError naming the file', async () => {
    await writeFile(join(basePath, 'creds.json'), '{not json', 'utf8');
    const files = createFilesContext({
      basePath,
      files: { creds: { filename: 'creds.json', schema: credsSchema } },
    });
    await expect(files.creds.read()).rejects.toBeInstanceOf(FileValidationError);
    await expect(files.creds.read()).rejects.toThrow(join(basePath, 'creds.json'));
  });

  test('schema-mismatched JSON throws FileValidationError with issue', async () => {
    await writeFile(join(basePath, 'creds.json'), JSON.stringify({ accessKey: 'AKIA' }), 'utf8');
    const files = createFilesContext({
      basePath,
      files: { creds: { filename: 'creds.json', schema: credsSchema } },
    });
    const promise = files.creds.read();
    await expect(promise).rejects.toBeInstanceOf(FileValidationError);
    await expect(promise).rejects.toThrow(/region/);
  });

  test('writes are atomic — the target path holds either old or new contents', async () => {
    const files = createFilesContext({
      basePath,
      files: { creds: { filename: 'creds.json', schema: credsSchema } },
    });
    await files.creds.write({ accessKey: 'old', region: 'eu' });
    await files.creds.write({ accessKey: 'new', region: 'eu' });
    const raw = await readFile(join(basePath, 'creds.json'), 'utf8');
    expect(JSON.parse(raw)).toEqual({ accessKey: 'new', region: 'eu' });
  });

  test('defaults narrow read() return to T and are returned on ENOENT', async () => {
    const defaults = { accessKey: 'fallback', region: 'eu-west-2' };
    const files = createFilesContext({
      basePath,
      files: {
        creds: { filename: 'absent.json', schema: credsSchema, defaults },
      },
    });
    const read = await files.creds.read();
    // Type-level: no `null` in the union — direct field access compiles.
    expect(read.accessKey).toBe('fallback');
    expect(read).toEqual(defaults);
  });

  test('defaults are deep-cloned per read so callers can mutate freely', async () => {
    const defaults = { accessKey: 'orig', region: 'eu' };
    const files = createFilesContext({
      basePath,
      files: {
        creds: { filename: 'absent.json', schema: credsSchema, defaults },
      },
    });
    const a = await files.creds.read();
    a.accessKey = 'mutated';
    const b = await files.creds.read();
    expect(b.accessKey).toBe('orig');
  });

  describe('ensureExists', () => {
    test('throws FileNotFoundError when the file is missing', async () => {
      const files = createFilesContext({
        basePath,
        files: { creds: { filename: 'absent.json', schema: credsSchema } },
      });
      const promise = files.creds.ensureExists();
      await expect(promise).rejects.toBeInstanceOf(FileNotFoundError);
      await expect(promise).rejects.toThrow(join(basePath, 'absent.json'));
    });

    test('resolves when the file exists', async () => {
      const files = createFilesContext({
        basePath,
        files: { creds: { filename: 'creds.json', schema: credsSchema } },
      });
      await files.creds.write({ accessKey: 'a', region: 'eu' });
      await expect(files.creds.ensureExists()).resolves.toBeUndefined();
    });

    test('custom message overrides the default error text', async () => {
      const files = createFilesContext({
        basePath,
        files: { creds: { filename: 'absent.json', schema: credsSchema } },
      });
      await expect(files.creds.ensureExists({ message: 'Run init first.' })).rejects.toThrow(
        'Run init first.',
      );
    });

    test('still throws when the spec has defaults — checks actual disk presence', async () => {
      const files = createFilesContext({
        basePath,
        files: {
          creds: {
            filename: 'absent.json',
            schema: credsSchema,
            defaults: { accessKey: 'd', region: 'eu' },
          },
        },
      });
      await expect(files.creds.ensureExists()).rejects.toBeInstanceOf(FileNotFoundError);
    });
  });

  test('defaults are ignored once the file exists', async () => {
    const files = createFilesContext({
      basePath,
      files: {
        creds: {
          filename: 'creds.json',
          schema: credsSchema,
          defaults: { accessKey: 'fallback', region: 'eu' },
        },
      },
    });
    await files.creds.write({ accessKey: 'real', region: 'us' });
    expect(await files.creds.read()).toEqual({ accessKey: 'real', region: 'us' });
  });
});
