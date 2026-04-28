interface StandardSchemaProps<Output> {
  readonly version: 1;
  readonly vendor: string;
  readonly validate: (
    value: unknown,
  ) => StandardSchemaResult<Output> | Promise<StandardSchemaResult<Output>>;
}

export interface StandardSchemaIssue {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined;
}

export type StandardSchemaResult<Output> =
  | { readonly value: Output; readonly issues?: undefined }
  | { readonly issues: ReadonlyArray<StandardSchemaIssue> };

export interface StandardSchema<Output = unknown> {
  readonly '~standard': StandardSchemaProps<Output>;
}

export type InferOutput<S> = S extends StandardSchema<infer O> ? O : never;

export async function settle<T>({
  schema,
  value,
}: {
  schema: StandardSchema<T>;
  value: unknown;
}): Promise<StandardSchemaResult<T>> {
  const r = schema['~standard'].validate(value);
  return r instanceof Promise ? await r : r;
}

function issuePath(issue: StandardSchemaIssue): string {
  if (!issue.path || issue.path.length === 0) {
    return '';
  }
  return issue.path
    .map((seg) => (typeof seg === 'object' && seg !== null ? String(seg.key) : String(seg)))
    .join('.');
}

export function normalizeIssues(
  issues: ReadonlyArray<StandardSchemaIssue>,
): ReadonlyArray<{ message: string; path: string }> {
  return issues.map((i) => ({ message: i.message, path: issuePath(i) }));
}
