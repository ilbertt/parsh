import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
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
  /**
   * Returned by `read()` when the file does not exist. Supplying this also
   * narrows `read()`'s return type from `T | null` to `T`.
   */
  defaults?: Output;
}

export interface FileHandle<T, R = T | null> {
  readonly path: string;
  read(): Promise<R>;
  write(value: T): Promise<void>;
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
   * basePath: join(osHomeConfigDir(), 'mycli')   // ~/Library/Application Support/mycli
   * basePath: join(osHomeDir(), '.mycli')        // ~/.mycli (dotfile layout)
   * ```
   */
  basePath: string;
  /**
   * For each key, `defaults` is type-checked against the schema's inferred
   * output.
   *
   * @example
   * ```ts
   * files: {
   *   creds: {
   *     filename: 'creds.json',
   *     schema: z.object({ accessKey: z.string() }),
   *     // @ts-expect-error — `accessKey` must be a string
   *     defaults: { accessKey: 1 },
   *   },
   * }
   * ```
   */
  files: Files & { [K in keyof Files]: FileSpec<InferOutput<Files[K]['schema']>> };
};

type ReadType<S extends FileSpec> = S extends { defaults: object }
  ? InferOutput<S['schema']>
  : InferOutput<S['schema']> | null;

export type CreateFilesContextResult<Files extends Record<string, FileSpec>> = {
  [K in keyof Files]: FileHandle<InferOutput<Files[K]['schema']>, ReadType<Files[K]>>;
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
 *         defaults: { region: 'eu-west-2' },
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
  const handles = {} as Record<string, FileHandle<unknown, unknown>>;
  for (const [name, spec] of Object.entries(files)) {
    handles[name] = makeHandle({
      path: join(basePath, spec.filename),
      schema: spec.schema,
      defaults: 'defaults' in spec ? spec.defaults : undefined,
      hasDefaults: 'defaults' in spec && spec.defaults !== undefined,
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

function makeHandle<T>({
  path,
  schema,
  defaults,
  hasDefaults,
}: {
  path: string;
  schema: StandardSchema<T>;
  defaults: T | undefined;
  hasDefaults: boolean;
}): FileHandle<T, T | null> {
  return {
    path,
    async read(): Promise<T | null> {
      let raw: string;
      try {
        raw = await readFile(path, 'utf8');
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          return hasDefaults ? structuredClone(defaults as T) : null;
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
        throw new FileValidationError({
          path,
          issues: normalizeIssues(result.issues),
        });
      }
      return result.value;
    },
    async write(value: T): Promise<void> {
      const result = await settle({ schema, value });
      if ('issues' in result && result.issues) {
        throw new FileValidationError({
          path,
          issues: normalizeIssues(result.issues),
        });
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
    },
  };
}
