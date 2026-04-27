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

  describe('defaults', () => {
    test('read() returns defaults when the file is missing', async () => {
      const defaults = { accessKey: 'default-key', region: 'us-east-1' };
      const files = createFilesContext({
        basePath,
        files: { creds: { filename: 'absent.json', schema: credsSchema, defaults } },
      });
      expect(await files.creds.read()).toEqual(defaults);
    });

    test('read() returns the file value when present (defaults ignored)', async () => {
      const defaults = { accessKey: 'default-key', region: 'us-east-1' };
      const files = createFilesContext({
        basePath,
        files: { creds: { filename: 'creds.json', schema: credsSchema, defaults } },
      });
      await files.creds.write({ accessKey: 'real', region: 'eu' });
      expect(await files.creds.read()).toEqual({ accessKey: 'real', region: 'eu' });
    });

    test('read() with defaults does not write to disk', async () => {
      const defaults = { accessKey: 'default-key', region: 'us-east-1' };
      const files = createFilesContext({
        basePath,
        files: { creds: { filename: 'absent.json', schema: credsSchema, defaults } },
      });
      await files.creds.read();
      expect(await files.creds.maybeRead()).toBeNull();
    });

    test('maybeRead() still returns null when missing, ignoring defaults', async () => {
      const defaults = { accessKey: 'default-key', region: 'us-east-1' };
      const files = createFilesContext({
        basePath,
        files: { creds: { filename: 'absent.json', schema: credsSchema, defaults } },
      });
      expect(await files.creds.maybeRead()).toBeNull();
    });
  });

  describe('update', () => {
    test('shallow-merges partial onto current value and persists', async () => {
      const files = createFilesContext({
        basePath,
        files: { creds: { filename: 'creds.json', schema: credsSchema } },
      });
      await files.creds.write({ accessKey: 'AKIA', region: 'eu' });
      await files.creds.update({ region: 'us' });
      expect(await files.creds.read()).toEqual({ accessKey: 'AKIA', region: 'us' });
    });

    test('uses defaults as the base when the file is missing', async () => {
      const defaults = { accessKey: 'default-key', region: 'eu' };
      const files = createFilesContext({
        basePath,
        files: { creds: { filename: 'creds.json', schema: credsSchema, defaults } },
      });
      await files.creds.update({ region: 'us' });
      expect(await files.creds.read()).toEqual({ accessKey: 'default-key', region: 'us' });
    });

    test('throws FileNotFoundError when the file is missing and no defaults', async () => {
      const files = createFilesContext({
        basePath,
        files: { creds: { filename: 'absent.json', schema: credsSchema } },
      });
      await expect(files.creds.update({ region: 'us' })).rejects.toBeInstanceOf(FileNotFoundError);
    });

    test('validates the merged result against the schema', async () => {
      const MIN_KEY_LENGTH = 4;
      const refined = z.object({
        accessKey: z.string().min(MIN_KEY_LENGTH),
        region: z.string(),
      });
      const files = createFilesContext({
        basePath,
        files: { creds: { filename: 'creds.json', schema: refined } },
      });
      await files.creds.write({ accessKey: 'AKIA', region: 'eu' });
      await expect(
        files.creds.update({ accessKey: 'a' } as Partial<{ accessKey: string; region: string }>),
      ).rejects.toBeInstanceOf(FileValidationError);
    });
  });

  describe('load (stateful handle)', () => {
    test('value reflects the on-disk content', async () => {
      const files = createFilesContext({
        basePath,
        files: { creds: { filename: 'creds.json', schema: credsSchema } },
      });
      await files.creds.write({ accessKey: 'AKIA', region: 'eu' });
      const stateful = await files.creds.load();
      expect(stateful.value).toEqual({ accessKey: 'AKIA', region: 'eu' });
      expect(stateful.path).toBe(join(basePath, 'creds.json'));
    });

    test('uses defaults when the file is missing', async () => {
      const defaults = { accessKey: 'default-key', region: 'eu' };
      const files = createFilesContext({
        basePath,
        files: { creds: { filename: 'absent.json', schema: credsSchema, defaults } },
      });
      const stateful = await files.creds.load();
      expect(stateful.value).toEqual(defaults);
    });

    test('throws FileNotFoundError when missing without defaults', async () => {
      const files = createFilesContext({
        basePath,
        files: { creds: { filename: 'absent.json', schema: credsSchema } },
      });
      await expect(files.creds.load()).rejects.toBeInstanceOf(FileNotFoundError);
    });

    test('is idempotent — same identity across calls, no extra disk reads', async () => {
      const files = createFilesContext({
        basePath,
        files: { creds: { filename: 'creds.json', schema: credsSchema } },
      });
      await files.creds.write({ accessKey: 'AKIA', region: 'eu' });
      const a = await files.creds.load();
      // Mutate the file outside the handle. Since load() is idempotent, the
      // second call must return the same already-loaded handle without
      // re-reading from disk.
      await writeFile(
        join(basePath, 'creds.json'),
        JSON.stringify({ accessKey: 'OTHER', region: 'us' }),
        'utf8',
      );
      const b = await files.creds.load();
      expect(b).toBe(a);
      expect(b.value).toEqual({ accessKey: 'AKIA', region: 'eu' });
    });

    test('set() merges, persists, and updates value', async () => {
      const files = createFilesContext({
        basePath,
        files: { creds: { filename: 'creds.json', schema: credsSchema } },
      });
      await files.creds.write({ accessKey: 'AKIA', region: 'eu' });
      const stateful = await files.creds.load();
      await stateful.set({ region: 'us' });
      expect(stateful.value).toEqual({ accessKey: 'AKIA', region: 'us' });
      expect(await files.creds.read()).toEqual({ accessKey: 'AKIA', region: 'us' });
    });

    test('replace() overwrites, persists, and updates value', async () => {
      const files = createFilesContext({
        basePath,
        files: { creds: { filename: 'creds.json', schema: credsSchema } },
      });
      await files.creds.write({ accessKey: 'AKIA', region: 'eu' });
      const stateful = await files.creds.load();
      await stateful.replace({ accessKey: 'NEW', region: 'us' });
      expect(stateful.value).toEqual({ accessKey: 'NEW', region: 'us' });
      expect(await files.creds.read()).toEqual({ accessKey: 'NEW', region: 'us' });
    });

    test('reload() resyncs value with on-disk content', async () => {
      const files = createFilesContext({
        basePath,
        files: { creds: { filename: 'creds.json', schema: credsSchema } },
      });
      await files.creds.write({ accessKey: 'AKIA', region: 'eu' });
      const stateful = await files.creds.load();
      await writeFile(
        join(basePath, 'creds.json'),
        JSON.stringify({ accessKey: 'OTHER', region: 'us' }),
        'utf8',
      );
      expect(stateful.value).toEqual({ accessKey: 'AKIA', region: 'eu' });
      await stateful.reload();
      expect(stateful.value).toEqual({ accessKey: 'OTHER', region: 'us' });
    });

    test('set() validates the merged result against the schema', async () => {
      const MIN_KEY_LENGTH = 4;
      const refined = z.object({
        accessKey: z.string().min(MIN_KEY_LENGTH),
        region: z.string(),
      });
      const files = createFilesContext({
        basePath,
        files: { creds: { filename: 'creds.json', schema: refined } },
      });
      await files.creds.write({ accessKey: 'AKIA', region: 'eu' });
      const stateful = await files.creds.load();
      await expect(
        stateful.set({ accessKey: 'a' } as Partial<{ accessKey: string; region: string }>),
      ).rejects.toBeInstanceOf(FileValidationError);
      expect(stateful.value).toEqual({ accessKey: 'AKIA', region: 'eu' });
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
