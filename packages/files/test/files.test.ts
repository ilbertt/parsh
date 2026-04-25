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
  test('handle.path resolves to basePath/filename', () => {
    const files = createFilesContext({
      basePath,
      files: { creds: { filename: 'creds.json', schema: credsSchema } },
    });
    expect(files.creds.path).toBe(join(basePath, 'creds.json'));
  });

  test('round-trip write→read returns equal value with inferred type', async () => {
    const files = createFilesContext({
      basePath,
      files: { creds: { filename: 'creds.json', schema: credsSchema } },
    });
    const value = { accessKey: 'AKIA', region: 'eu-west-2' };
    await files.creds.write(value);
    expect(await files.creds.read()).toEqual(value);
  });

  test('writes are atomic — last write wins', async () => {
    const files = createFilesContext({
      basePath,
      files: { creds: { filename: 'creds.json', schema: credsSchema } },
    });
    await files.creds.write({ accessKey: 'old', region: 'eu' });
    await files.creds.write({ accessKey: 'new', region: 'eu' });
    const raw = await readFile(join(basePath, 'creds.json'), 'utf8');
    expect(JSON.parse(raw)).toEqual({ accessKey: 'new', region: 'eu' });
  });

  describe('read', () => {
    test('returns parsed value typed as T', async () => {
      const files = createFilesContext({
        basePath,
        files: { creds: { filename: 'creds.json', schema: credsSchema } },
      });
      await files.creds.write({ accessKey: 'AKIA', region: 'eu' });
      const value = await files.creds.read();
      expect(value.accessKey).toBe('AKIA');
    });

    test('throws FileNotFoundError when the file is missing', async () => {
      const files = createFilesContext({
        basePath,
        files: { creds: { filename: 'absent.json', schema: credsSchema } },
      });
      await expect(files.creds.read()).rejects.toBeInstanceOf(FileNotFoundError);
    });

    test('throws FileValidationError on corrupt JSON', async () => {
      await writeFile(join(basePath, 'creds.json'), '{not json', 'utf8');
      const files = createFilesContext({
        basePath,
        files: { creds: { filename: 'creds.json', schema: credsSchema } },
      });
      await expect(files.creds.read()).rejects.toBeInstanceOf(FileValidationError);
    });

    test('throws FileValidationError on schema mismatch', async () => {
      await writeFile(join(basePath, 'creds.json'), JSON.stringify({ accessKey: 'AKIA' }), 'utf8');
      const files = createFilesContext({
        basePath,
        files: { creds: { filename: 'creds.json', schema: credsSchema } },
      });
      const promise = files.creds.read();
      await expect(promise).rejects.toBeInstanceOf(FileValidationError);
      await expect(promise).rejects.toThrow(/region/);
    });
  });

  describe('maybeRead', () => {
    test('returns null when the file is missing', async () => {
      const files = createFilesContext({
        basePath,
        files: { creds: { filename: 'absent.json', schema: credsSchema } },
      });
      expect(await files.creds.maybeRead()).toBeNull();
    });

    test('returns the value when present', async () => {
      const files = createFilesContext({
        basePath,
        files: { creds: { filename: 'creds.json', schema: credsSchema } },
      });
      await files.creds.write({ accessKey: 'a', region: 'eu' });
      expect(await files.creds.maybeRead()).toEqual({ accessKey: 'a', region: 'eu' });
    });

    test('still throws FileValidationError on corrupt JSON', async () => {
      await writeFile(join(basePath, 'creds.json'), '{not json', 'utf8');
      const files = createFilesContext({
        basePath,
        files: { creds: { filename: 'creds.json', schema: credsSchema } },
      });
      await expect(files.creds.maybeRead()).rejects.toBeInstanceOf(FileValidationError);
    });
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
  });
});
