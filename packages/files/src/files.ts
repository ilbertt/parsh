import { join } from 'node:path';
import { FileNotFoundError } from './errors.js';
import { checkExists, ENOENT_MARKER, loadAndValidate, validateAndWriteAtomic } from './io.js';
import type { InferOutput, StandardSchema } from './standard-schema.js';

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
