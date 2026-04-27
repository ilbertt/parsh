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
  /** Joined with `basePath` to form the path. Include the extension (typically `.json`). */
  filename: string;
  /**
   * Returned by `read()` and `load()` when the file is missing. Never
   * written to disk implicitly — only an explicit write/update/set/replace
   * persists state.
   */
  defaults?: Output;
}

export interface FileHandle<T> {
  readonly path: string;
  /**
   * Reads and returns the file contents — or `defaults`, if the spec
   * provides them and the file is missing.
   *
   * @throws {FileNotFoundError} File missing and no `defaults`.
   * @throws {FileValidationError} Invalid JSON or schema mismatch.
   */
  read(): Promise<T>;
  /**
   * Like {@link FileHandle.read}, but returns `null` for a missing file
   * instead of throwing. Ignores `defaults`.
   *
   * @throws {FileValidationError} Invalid JSON or schema mismatch.
   */
  maybeRead(): Promise<T | null>;
  /**
   * Validates and atomically writes `value` (write-via-rename — no
   * half-written JSON on disk).
   *
   * @throws {FileValidationError} `value` fails schema validation.
   */
  write(value: T): Promise<void>;
  /**
   * Read-modify-write: reads the current value (or `defaults`), shallow-
   * merges `partial`, validates, and writes atomically.
   *
   * @remarks Not concurrency-safe within a process — there is no lock
   * between the read and the write. Serialize updates that may overlap.
   *
   * @throws {FileNotFoundError} File missing and no `defaults`.
   * @throws {FileValidationError} Merged value fails schema validation.
   */
  update(partial: Partial<T>): Promise<void>;
  /**
   * Asserts the file exists. Pass `opts.message` to customize the error
   * (e.g. `'Run `mycli init` first.'`) — it surfaces directly to the user
   * when thrown from a `beforeHandler`.
   *
   * @throws {FileNotFoundError} File does not exist.
   */
  ensureExists(opts?: { message?: string }): Promise<void>;
  /**
   * Loads the file once into memory and returns a stateful handle with
   * synchronous `.value` access plus async partial writes.
   *
   * @remarks Idempotent — repeated calls return the same handle and do not
   * re-read disk. Use {@link StatefulFileHandle.reload} to pick up
   * external changes. Assumes single-process ownership of the file.
   *
   * @throws {FileNotFoundError} First call, file missing, no `defaults`.
   * @throws {FileValidationError} First call, invalid JSON or schema mismatch.
   */
  load(): Promise<StatefulFileHandle<T>>;
}

export interface StatefulFileHandle<T> {
  readonly path: string;
  /** The latest in-memory snapshot. Kept in sync by `set()` / `replace()` / `reload()`. */
  readonly value: Readonly<T>;
  /**
   * Shallow-merges `partial` over `value`, validates, atomically writes, and
   * updates `value`. The async equivalent of {@link FileHandle.update}.
   *
   * @throws {FileValidationError} Merged value fails schema validation.
   */
  set(partial: Partial<T>): Promise<void>;
  /**
   * Validates, atomically writes, and updates `value`.
   *
   * @throws {FileValidationError} `value` fails schema validation.
   */
  replace(value: T): Promise<void>;
  /**
   * Re-reads from disk and replaces `value`. Only needed when the file was
   * modified externally — `set()` and `replace()` already keep `value`
   * in sync.
   *
   * @throws {FileNotFoundError} File missing and no `defaults`.
   * @throws {FileValidationError} Invalid JSON or schema mismatch.
   */
  reload(): Promise<void>;
}

/** Thrown when a file expected to exist on disk is missing. */
export class FileNotFoundError extends Error {
  readonly path: string;
  constructor({ path, message }: { path: string; message?: string }) {
    super(message ?? `file not found at ${path}`);
    this.name = 'FileNotFoundError';
    this.path = path;
  }
}

/** Thrown when JSON is malformed or fails schema validation. `issues` carries one entry per failing path. */
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
  files: {
    [K in keyof Files]: Files[K] & {
      defaults?: InferOutput<Files[K]['schema']>;
    };
  };
};

export type CreateFilesContextResult<Files extends Record<string, FileSpec>> = {
  [K in keyof Files]: FileHandle<InferOutput<Files[K]['schema']>>;
};

/**
 * Returns a typed map of {@link FileHandle}s — assign it under your
 * `createCli` `context`. Each handle is typed from its Standard Schema and
 * persists JSON to disk at `path.join(basePath, spec.filename)`.
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
      defaults: spec.defaults,
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

function makeHandle<T>({
  path,
  schema,
  defaults,
}: {
  path: string;
  schema: StandardSchema<T>;
  defaults: T | undefined;
}): FileHandle<T> {
  let stateful: StatefulFileHandle<T> | undefined;

  const read = async (): Promise<T> => {
    const v = await loadAndValidate({ path, schema });
    if (v === ENOENT_MARKER) {
      if (defaults !== undefined) {
        return defaults;
      }
      throw new FileNotFoundError({ path });
    }
    return v;
  };

  const handle: FileHandle<T> = {
    path,
    ensureExists: (opts) => checkExists({ path, message: opts?.message }),
    read,
    maybeRead: async () => {
      const v = await loadAndValidate({ path, schema });
      return v === ENOENT_MARKER ? null : v;
    },
    write: async (value) => {
      await validateAndWriteAtomic({ path, schema, value });
    },
    update: async (partial) => {
      const current = await read();
      await validateAndWriteAtomic({
        path,
        schema,
        value: { ...current, ...partial } as T,
      });
    },
    load: async () => {
      if (stateful) {
        return stateful;
      }
      let snapshot = await read();
      const built: StatefulFileHandle<T> = {
        path,
        get value() {
          return snapshot;
        },
        set: async (partial) => {
          snapshot = await validateAndWriteAtomic({
            path,
            schema,
            value: { ...snapshot, ...partial } as T,
          });
        },
        replace: async (value) => {
          snapshot = await validateAndWriteAtomic({ path, schema, value });
        },
        reload: async () => {
          snapshot = await read();
        },
      };
      stateful = built;
      return built;
    },
  };
  return handle;
}
