import { access, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { FileNotFoundError, FileValidationError } from './errors.js';
import { normalizeIssues, type StandardSchema, settle } from './standard-schema.js';

export const ENOENT_MARKER = Symbol('enoent');

export async function checkExists({
  path,
  message,
}: {
  path: string;
  message: string | undefined;
}): Promise<void> {
  try {
    await access(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err;
    }
    throw new FileNotFoundError({ path, ...(message ? { message } : {}) });
  }
}

export async function loadAndValidate<T>({
  path,
  schema,
}: {
  path: string;
  schema: StandardSchema<T>;
}): Promise<T | typeof ENOENT_MARKER> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return ENOENT_MARKER;
    }
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new FileValidationError({
      path,
      issues: [{ message: `not valid JSON: ${(err as Error).message}`, path: '' }],
    });
  }
  const result = await settle({ schema, value: parsed });
  if ('issues' in result && result.issues) {
    throw new FileValidationError({ path, issues: normalizeIssues(result.issues) });
  }
  return result.value;
}

export async function validateAndWriteAtomic<T>({
  path,
  schema,
  value,
}: {
  path: string;
  schema: StandardSchema<T>;
  value: T;
}): Promise<T> {
  const result = await settle({ schema, value });
  if ('issues' in result && result.issues) {
    throw new FileValidationError({ path, issues: normalizeIssues(result.issues) });
  }
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(result.value, null, 2)}\n`, 'utf8');
  try {
    await rename(tmp, path);
  } catch (err) {
    await unlink(tmp).catch(() => {});
    throw err;
  }
  return result.value;
}
