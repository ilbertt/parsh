import { access, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

interface StandardSchemaProps<Output> {
  readonly version: 1;
  readonly vendor: string;
  readonly validate: (
    value: unknown,
  ) => StandardSchemaResult<Output> | Promise<StandardSchemaResult<Output>>;
}

interface StandardSchemaIssue {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined;
}

type StandardSchemaResult<Output> =
  | { readonly value: Output; readonly issues?: undefined }
  | { readonly issues: ReadonlyArray<StandardSchemaIssue> };

interface StandardSchema<Output = unknown> {
  readonly '~standard': StandardSchemaProps<Output>;
}

type InferOutput<S> = S extends StandardSchema<infer O> ? O : never;

export interface FileSpec<Output = unknown> {
  schema: StandardSchema<Output>;
  /**
   * Filename of the JSON file on disk, joined with `basePath` to produce the
   * final path. Include the extension yourself (typically `.json`).
   */
  filename: string;
}

export interface FileHandle<T> {
  readonly path: string;
  /**
   * Reads the file and returns `T`. Assumes existence was already validated
   * upstream (typically by `ensureExists()` in a `beforeHandler`). Throws an
   * internal `FileNotFoundError` if the file is missing — that error is a
   * developer signal, not user-facing copy. Throws `FileValidationError` on
   * bad JSON or schema mismatch.
   */
  read(): Promise<T>;
  /** Like `read()`, but returns `null` instead of throwing when the file is missing. */
  maybeRead(): Promise<T | null>;
  write(value: T): Promise<void>;
  /**
   * Throws `FileNotFoundError` if the file does not exist on disk. Pass
   * `message` to customize the error (e.g. `'Run \`mycli init\` first.'`) —
   * the message surfaces directly to the user when called from a
   * `beforeHandler`.
   */
  ensureExists(opts?: { message?: string }): Promise<void>;
}

export class FileNotFoundError extends Error {
  readonly path: string;
  constructor({ path, message }: { path: string; message?: string }) {
    super(message ?? `file not found at ${path}`);
    this.name = 'FileNotFoundError';
    this.path = path;
  }
}

export class FileValidationError extends Error {
  readonly path: string;
  readonly issues: ReadonlyArray<{ message: string; path: string }>;
  constructor({
    path,
    issues,
  }: {
    path: string;
    issues: ReadonlyArray<{ message: string; path: string }>;
  }) {
    const summary = issues
      .map((i) => (i.path === '' ? i.message : `${i.path}: ${i.message}`))
      .join('; ');
    super(`invalid file at ${path}: ${summary}`);
    this.name = 'FileValidationError';
    this.path = path;
    this.issues = issues;
  }
}

function issuePath(issue: StandardSchemaIssue): string {
  if (!issue.path || issue.path.length === 0) {
    return '';
  }
  return issue.path
    .map((seg) => (typeof seg === 'object' && seg !== null ? String(seg.key) : String(seg)))
    .join('.');
}

function normalizeIssues(
  issues: ReadonlyArray<StandardSchemaIssue>,
): ReadonlyArray<{ message: string; path: string }> {
  return issues.map((i) => ({ message: i.message, path: issuePath(i) }));
}

type CreateFilesContextInput<Files extends Record<string, FileSpec>> = {
  /**
   * Parent directory under which each file is written. The full path of each
   * file is `path.join(basePath, spec.filename)`. Compose with `osHomeDir()`
   * or `osHomeConfigDir()` for cross-platform paths, or pass any string.
   *
   * @example
   * ```ts
   * basePath: join(osHomeConfigDir(), 'mycli')   // ~/.config/mycli
   * basePath: join(osHomeDir(), '.mycli')        // ~/.mycli (dotfile layout)
   * ```
   */
  basePath: string;
  files: Files;
};

export type CreateFilesContextResult<Files extends Record<string, FileSpec>> = {
  [K in keyof Files]: FileHandle<InferOutput<Files[K]['schema']>>;
};

/**
 * Returns a typed handles map — assign it to whatever key you like under your
 * `createCli` `context`. Each handle is typed from its Standard Schema and
 * persists JSON to disk at `path.join(basePath, spec.filename)`. Optional
 * `defaults` narrow `read()` from `T | null` to `T`.
 *
 * @example
 * ```ts
 * const context = {
 *   files: createFilesContext({
 *     basePath: join(osHomeConfigDir(), 'mycli'),
 *     files: {
 *       config: {
 *         filename: 'config.json',
 *         schema: z.object({ region: z.string() }),
 *       },
 *     },
 *   }),
 * };
 * ```
 */
export function createFilesContext<const Files extends Record<string, FileSpec>>({
  basePath,
  files,
}: CreateFilesContextInput<Files>): CreateFilesContextResult<Files> {
  const handles = {} as Record<string, FileHandle<unknown>>;
  for (const [name, spec] of Object.entries(files)) {
    handles[name] = makeHandle({
      path: join(basePath, spec.filename),
      schema: spec.schema,
    });
  }
  return handles as CreateFilesContextResult<Files>;
}

/**
 * The current user's home directory.
 *
 * - **macOS / Linux:** `/Users/<user>` / `/home/<user>`
 * - **Windows:** `C:\Users\<user>`
 *
 * @example
 * ```ts
 * basePath: join(osHomeDir(), '.mycli')   // ~/.mycli (dotfile layout)
 * ```
 */
export function osHomeDir(): string {
  return homedir();
}

/**
 * The per-user config directory (without an app subdir). Follows the XDG
 * convention everywhere except Windows — same dir most CLI tools (gh, gcloud,
 * kubectl, helm) use on macOS, even though `~/Library/Application Support` is
 * Apple's GUI-app convention.
 *
 * - **macOS / Linux:** `$XDG_CONFIG_HOME` if set, otherwise `~/.config`
 * - **Windows:** `%APPDATA%` if set, otherwise `~/AppData/Roaming`
 *
 * @example
 * ```ts
 * basePath: join(osHomeConfigDir(), 'mycli')   // ~/.config/mycli
 * ```
 */
export function osHomeConfigDir(): string {
  const home = homedir();
  if (process.platform === 'win32') {
    return process.env.APPDATA ?? join(home, 'AppData', 'Roaming');
  }
  return process.env.XDG_CONFIG_HOME ?? join(home, '.config');
}

async function settle<T>({
  schema,
  value,
}: {
  schema: StandardSchema<T>;
  value: unknown;
}): Promise<StandardSchemaResult<T>> {
  const r = schema['~standard'].validate(value);
  return r instanceof Promise ? await r : r;
}

const ENOENT_MARKER = Symbol('enoent');

async function checkExists({
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

async function loadAndValidate<T>({
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

async function validateAndWriteAtomic<T>({
  path,
  schema,
  value,
}: {
  path: string;
  schema: StandardSchema<T>;
  value: T;
}): Promise<void> {
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
}

function makeHandle<T>({
  path,
  schema,
}: {
  path: string;
  schema: StandardSchema<T>;
}): FileHandle<T> {
  return {
    path,
    ensureExists: (opts) => checkExists({ path, message: opts?.message }),
    read: async () => {
      const v = await loadAndValidate({ path, schema });
      if (v === ENOENT_MARKER) {
        throw new FileNotFoundError({ path });
      }
      return v;
    },
    maybeRead: async () => {
      const v = await loadAndValidate({ path, schema });
      return v === ENOENT_MARKER ? null : v;
    },
    write: (value) => validateAndWriteAtomic({ path, schema, value }),
  };
}
