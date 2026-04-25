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

export interface EnvVarSpec<Output = unknown> {
  schema: StandardSchema<Output>;
  /**
   * Name of the variable in the source (typically `process.env`). Defaults to
   * the key under `vars` when omitted, so `vars: { PORT: { schema } }` reads
   * `source.PORT`. Set this when the in-code key should differ from the
   * environment variable name.
   */
  name?: string;
  /**
   * Returned when the source has no value for this variable (`undefined` or
   * empty string). The schema is bypassed for the default — supply a value
   * already in the schema's output type.
   */
  default?: Output;
}

export class EnvValidationError extends Error {
  readonly variable: string;
  readonly issues: ReadonlyArray<{ message: string; path: string }>;
  constructor({
    variable,
    issues,
  }: {
    variable: string;
    issues: ReadonlyArray<{ message: string; path: string }>;
  }) {
    const summary = issues
      .map((i) => (i.path === '' ? i.message : `${i.path}: ${i.message}`))
      .join('; ');
    super(`invalid env var ${variable}: ${summary}`);
    this.name = 'EnvValidationError';
    this.variable = variable;
    this.issues = issues;
  }
}

export class EnvMissingError extends Error {
  readonly variable: string;
  constructor({ variable }: { variable: string }) {
    super(`missing env var ${variable}`);
    this.name = 'EnvMissingError';
    this.variable = variable;
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

function settle<T>({
  schema,
  value,
}: {
  schema: StandardSchema<T>;
  value: unknown;
}): StandardSchemaResult<T> {
  const r = schema['~standard'].validate(value);
  if (r instanceof Promise) {
    return {
      issues: [{ message: 'async schemas are not supported for env vars' }],
    };
  }
  return r;
}

/**
 * Try the raw string first, then a numeric coercion, then a boolean
 * coercion — first success wins. Mirrors core's option/param parsing so
 * users can write `z.number()` / `z.boolean()` without `z.coerce.*`.
 */
function validateScalar<T>({
  schema,
  raw,
}: {
  schema: StandardSchema<T>;
  raw: string;
}): StandardSchemaResult<T> {
  const first = settle({ schema, value: raw });
  if (!('issues' in first && first.issues)) {
    return first;
  }
  if (raw.trim().length > 0) {
    const n = Number(raw);
    if (Number.isFinite(n)) {
      const r = settle({ schema, value: n });
      if (!('issues' in r && r.issues)) {
        return r;
      }
    }
  }
  if (raw === 'true' || raw === 'false') {
    const r = settle({ schema, value: raw === 'true' });
    if (!('issues' in r && r.issues)) {
      return r;
    }
  }
  return first;
}

type CreateEnvContextInput<Vars extends Record<string, EnvVarSpec>> = {
  /**
   * Source of raw values. Defaults to `process.env`. Override with any
   * `Record<string, string | undefined>` for testing or alternative providers
   * (e.g. a parsed `.env` file).
   */
  source?: Record<string, string | undefined>;
  /**
   * For each key, `default` is type-checked against the schema's inferred
   * output. The key (or `spec.name`) is read from `source`.
   *
   * @example
   * ```ts
   * vars: {
   *   PORT: {
   *     schema: z.coerce.number().int().positive(),
   *     // @ts-expect-error — default must be a number
   *     default: '3000',
   *   },
   * }
   * ```
   */
  vars: Vars & { [K in keyof Vars]: EnvVarSpec<InferOutput<Vars[K]['schema']>> };
};

export type CreateEnvContextResult<Vars extends Record<string, EnvVarSpec>> = {
  readonly [K in keyof Vars]: InferOutput<Vars[K]['schema']>;
};

/**
 * Returns a flat typed object whose property reads validate the corresponding
 * environment variable on first access and cache the result. Each property's
 * type is inferred from its Standard Schema.
 *
 * Validation is **lazy**: a missing or invalid variable only throws when the
 * property is read, so subcommands that never touch a variable never pay the
 * cost or risk an error.
 *
 * Raw values are tried first as the string, then with numeric coercion, then
 * with boolean coercion — first success wins. So `z.number()` / `z.boolean()`
 * work without `z.coerce.*`, mirroring how core parses options and params.
 *
 * Schemas must be synchronous — `process.env` reads cannot await. If a schema
 * returns a Promise from `validate`, an error is thrown.
 *
 * @example
 * ```ts
 * const context = {
 *   env: createEnvContext({
 *     vars: {
 *       PORT: { schema: z.number().int().positive(), default: 3000 },
 *       DATABASE_URL: { schema: z.url() },
 *       NODE_ENV: { schema: z.enum(['development', 'production']) },
 *     },
 *   }),
 * };
 * ```
 */
export function createEnvContext<const Vars extends Record<string, EnvVarSpec>>({
  source,
  vars,
}: CreateEnvContextInput<Vars>): CreateEnvContextResult<Vars> {
  const src = source ?? (process.env as Record<string, string | undefined>);
  const cache = new Map<string, unknown>();
  const target = {} as Record<string, unknown>;

  for (const [key, spec] of Object.entries(vars)) {
    const variable = spec.name ?? key;
    const hasDefault = 'default' in spec && spec.default !== undefined;
    Object.defineProperty(target, key, {
      enumerable: true,
      configurable: false,
      get(): unknown {
        if (cache.has(key)) {
          return cache.get(key);
        }
        const raw = src[variable];
        if (raw === undefined || raw === '') {
          if (hasDefault) {
            cache.set(key, spec.default);
            return spec.default;
          }
          throw new EnvMissingError({ variable });
        }
        const result = validateScalar({ schema: spec.schema, raw });
        if ('issues' in result && result.issues) {
          throw new EnvValidationError({
            variable,
            issues: normalizeIssues(result.issues),
          });
        }
        cache.set(key, result.value);
        return result.value;
      },
    });
  }

  return target as CreateEnvContextResult<Vars>;
}
