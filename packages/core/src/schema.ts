/**
 * Standard Schema v1 — minimal surface inlined to avoid a runtime dep.
 * See https://standardschema.dev for the full spec.
 */

export namespace StandardSchemaV1 {
  export interface Props<Input = unknown, Output = Input> {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (value: unknown) => Result<Output> | Promise<Result<Output>>;
    readonly types?: Types<Input, Output> | undefined;
  }

  export type Result<Output> = SuccessResult<Output> | FailureResult;

  export interface SuccessResult<Output> {
    readonly value: Output;
    readonly issues?: undefined;
  }

  export interface FailureResult {
    readonly issues: ReadonlyArray<Issue>;
  }

  export interface Issue {
    readonly message: string;
    readonly path?: ReadonlyArray<PropertyKey | PathSegment> | undefined;
  }

  export interface PathSegment {
    readonly key: PropertyKey;
  }

  export interface Types<Input = unknown, Output = Input> {
    readonly input: Input;
    readonly output: Output;
  }
}

export interface StandardSchema<Input = unknown, Output = Input> {
  readonly '~standard': StandardSchemaV1.Props<Input, Output>;
}

export type AnySchema = StandardSchema<unknown, unknown>;

export type InferOutput<S> = S extends StandardSchema<unknown, infer O> ? O : never;

export type InferSchemas<Schemas extends Record<string, AnySchema>> = {
  -readonly [K in keyof Schemas]: InferOutput<Schemas[K]>;
};

/**
 * An option declaration. The `schema` validates the parsed value;
 * `forwardToChildren` exposes the option (and its required-ness) to descendant
 * commands' `ctx.parents` / `ctx.root`. Default is `false` — the option lives
 * only on its declaring command.
 */
export interface CommandOption<S extends AnySchema = AnySchema> {
  schema: S;
  forwardToChildren?: boolean;
  description?: string;
  /**
   * Alternate names for the flag. Single-char entries dispatch as `-x`;
   * longer entries dispatch as `--xxx`. Aliases must not collide with any
   * other visible option's name or alias on the same command (own +
   * forwarded ancestors). Validated at `Cli` construction.
   */
  aliases?: ReadonlyArray<string>;
}

export type AnyOption = CommandOption<AnySchema>;

export type OptionsRecord = Record<string, AnyOption>;

export type InferOptions<O extends OptionsRecord> = {
  -readonly [K in keyof O]: InferOutput<O[K]['schema']>;
};

type ForwardedKeys<O extends OptionsRecord> = {
  [K in keyof O]: O[K] extends { forwardToChildren: true } ? K : never;
}[keyof O];

/**
 * The descendant-visible projection of an ancestor's options. Includes only
 * entries flagged `forwardToChildren: true`. Used by the generated registry
 * to type `ctx.parents[path].options` and `ctx.root.options`.
 */
export type InferForwardedOptions<O extends OptionsRecord> = {
  -readonly [K in ForwardedKeys<O>]: InferOutput<O[K]['schema']>;
};
