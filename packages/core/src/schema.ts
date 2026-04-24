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

export type InferArgs<Schemas extends Record<string, AnySchema>> = {
  -readonly [K in keyof Schemas]: InferOutput<Schemas[K]>;
};
