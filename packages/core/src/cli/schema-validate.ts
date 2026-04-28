import type { AnySchema } from '../schema.js';

export interface SchemaSpec {
  schema: AnySchema;
  required?: boolean;
}

export type SpecRecord = Record<string, SchemaSpec>;

export interface ParserShape {
  type: 'boolean' | 'string';
  multiple?: boolean;
}

type SchemaResult = { value: unknown; issues?: undefined } | { issues: ReadonlyArray<unknown> };

async function probeAccepts({
  schema,
  value,
}: {
  schema: AnySchema;
  value: unknown;
}): Promise<boolean> {
  const r = schema['~standard'].validate(value);
  const settled = r instanceof Promise ? await r : r;
  return !('issues' in settled && settled.issues);
}

/**
 * Determine how `parseArgs` should treat an option, by probing its schema.
 *
 * 1. If it accepts an array (`[]`, `['x']`, `[0]`), the flag is repeatable
 *    (`--header A --header B` → `['A', 'B']`).
 * 2. Else if it accepts `true` but rejects an arbitrary string, the flag is
 *    boolean (consumes no value).
 * 3. Otherwise, the flag is a single-value string. Numeric/enum schemas land
 *    here; argv is always a string and `validateScalar` retries with numeric
 *    coercion later.
 */
export async function inferOptionParserShape(schema: AnySchema): Promise<ParserShape> {
  if (await probeAccepts({ schema, value: [] })) {
    return { type: 'string', multiple: true };
  }
  if (await probeAccepts({ schema, value: ['__parsh_probe__'] })) {
    return { type: 'string', multiple: true };
  }
  if (await probeAccepts({ schema, value: [0] })) {
    return { type: 'string', multiple: true };
  }
  if (await probeAccepts({ schema, value: true })) {
    if (!(await probeAccepts({ schema, value: '__parsh_probe__' }))) {
      return { type: 'boolean' };
    }
  }
  return { type: 'string' };
}

async function settle({
  schema,
  value,
}: {
  schema: AnySchema;
  value: unknown;
}): Promise<SchemaResult> {
  const r = schema['~standard'].validate(value);
  return r instanceof Promise ? await r : r;
}

/**
 * argv values arrive as strings. Try the raw string first, then a numeric
 * coercion, then a boolean coercion — first success wins. Lets users write
 * `z.number()` / `z.boolean()` without `z.coerce.*`. Schemas that accept the
 * string as-is are unaffected.
 */
async function validateScalar({
  schema,
  raw,
}: {
  schema: AnySchema;
  raw: unknown;
}): Promise<SchemaResult> {
  const first = await settle({ schema, value: raw });
  if (!('issues' in first && first.issues)) {
    return first;
  }
  if (typeof raw !== 'string' || raw.length === 0) {
    return first;
  }
  if (raw.trim().length > 0) {
    const n = Number(raw);
    if (Number.isFinite(n)) {
      const r = await settle({ schema, value: n });
      if (!('issues' in r && r.issues)) {
        return r;
      }
    }
  }
  if (raw === 'true' || raw === 'false') {
    const r = await settle({ schema, value: raw === 'true' });
    if (!('issues' in r && r.issues)) {
      return r;
    }
  }
  return first;
}

export async function validateRecord({
  specs,
  values,
  kind,
}: {
  specs: SpecRecord;
  values: Record<string, unknown>;
  kind: 'option' | 'param';
}): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false; error: string }> {
  const out: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(specs)) {
    const raw = values[name];
    if (raw === undefined) {
      if (spec.required === true) {
        return { ok: false, error: `missing required ${kind}: ${name}` };
      }
      const settled = await settle({ schema: spec.schema, value: undefined });
      if ('issues' in settled && settled.issues) {
        return { ok: false, error: `missing required ${kind}: ${name}` };
      }
      out[name] = settled.value;
      continue;
    }
    const settled = await validateScalar({ schema: spec.schema, raw });
    if ('issues' in settled && settled.issues) {
      const msg = settled.issues.map((i) => (i as { message: string }).message).join(', ');
      return { ok: false, error: `invalid ${kind} "${name}": ${msg}` };
    }
    out[name] = settled.value;
  }
  return { ok: true, value: out };
}
