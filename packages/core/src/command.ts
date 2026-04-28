import type { Print } from './print.js';
import type { CommandEntry, CommandRegistry, RegisteredContext, Simplify } from './registry.js';
import type { AnyParam, InferOptions, InferParams, OptionsRecord } from './schema.js';

type LastSegment<P extends string> = P extends `${string} ${infer Rest}` ? LastSegment<Rest> : P;

type OwnParamName<P extends string> = LastSegment<P> extends `[${infer N}]` ? N : never;

/**
 * Ordered tuple of bracket-segment names in a path string.
 * `'s3 buckets [name] create'` → `['name']`. `'s3 ls'` → `[]`.
 */
type ParamNamesOf<P extends string> = P extends `${infer Head} ${infer Rest}`
  ? Head extends `[${infer N}]`
    ? [N, ...ParamNamesOf<Rest>]
    : ParamNamesOf<Rest>
  : P extends `[${infer N}]`
    ? [N]
    : [];

/** True iff two readonly tuples have identical elements in the same order. */
type SameTuple<A extends readonly unknown[], B extends readonly unknown[]> = A extends B
  ? B extends A
    ? true
    : false
  : false;

/**
 * The set of registered paths an alias at `P` may target: all registered
 * paths other than `P` whose param-name tuple matches `P`'s exactly. A
 * mismatch (e.g. `s3 ls` aliasing `s3 buckets [name] create`) is a compile
 * error, not a runtime one.
 */
type AliasTarget<P extends keyof CommandRegistry> = {
  [T in Exclude<keyof CommandRegistry, P>]: SameTuple<
    ParamNamesOf<T & string>,
    ParamNamesOf<P & string>
  > extends true
    ? T
    : never;
}[Exclude<keyof CommandRegistry, P>];

/**
 * - path has no bracket in its last segment → `params` field is forbidden.
 * - path ends in `[name]` → `params` required with exactly one key `name`.
 */
type ParamsConstraint<P extends string> = [OwnParamName<P>] extends [never]
  ? { params?: never }
  : { params: { [K in OwnParamName<P>]: AnyParam } };

/**
 * Maps each key of an inferred `params` literal to `AnyParam` if the key matches
 * the path's own bracket name, otherwise to a templated error string. Providing
 * a value for an extra key fails type-check because the value cannot be
 * assigned to that string literal type, and the error message tells the user
 * exactly which key was extra and why.
 *
 * This is the mechanism that makes the path string the single source of truth:
 * extra keys, missing keys, and wrong keys are all compile errors.
 */
type StrictParams<P extends string, Params> = {
  [K in keyof Params]: K extends OwnParamName<P>
    ? AnyParam
    : `Error: '${K & string}' is not a param in the path '${P}'`;
};

type OwnParamsOf<P extends string, Params extends Record<string, AnyParam>> = [
  OwnParamName<P>,
] extends [never]
  ? Record<string, never>
  : InferParams<Params>;

type HandlerCtx<
  P extends keyof CommandRegistry,
  Options extends OptionsRecord,
  Params extends Record<string, AnyParam>,
> = CommandRegistry[P] extends CommandEntry
  ? Simplify<{
      options: Simplify<InferOptions<Options>>;
      params: Simplify<OwnParamsOf<P & string, Params>>;
      parents: CommandRegistry[P]['parents'];
      rootOptions: CommandRegistry[P]['rootOptions'];
      print: Print;
      /**
       * User-defined context passed to `createCli({ context })`. Resolves to
       * `never` if the CLI was created without a `context`.
       */
      context: RegisteredContext;
    }>
  : never;

type RootHandlerCtx<Options extends OptionsRecord> = Simplify<{
  options: Simplify<InferOptions<Options>>;
  print: Print;
  /**
   * User-defined context passed to `createCli({ context })`. Resolves to
   * `never` if the CLI was created without a `context`.
   */
  context: RegisteredContext;
}>;

type HelpArgConfig = { enabled: boolean };

type DefinedCommand<
  P extends keyof CommandRegistry,
  Options extends OptionsRecord,
  Params extends Record<string, AnyParam>,
> = {
  path: P;
  options: Options;
  params: Params;
  helpArg: HelpArgConfig;
  description?: string;
  hidden?: boolean;
  handler?: (ctx: unknown) => void | Promise<void>;
  beforeHandler?: (ctx: unknown) => void | Promise<void>;
  afterHandler?: (ctx: unknown) => void | Promise<void>;
};

type DefinedAliasCommand<P extends keyof CommandRegistry> = {
  path: P;
  aliasOf: string;
  options: Record<string, never>;
  helpArg: HelpArgConfig;
};

/**
 * Alias form of `defineCommand`. The alias inherits the target's description,
 * options, params, and behavior — there is nothing else to configure. The
 * target must be a registered path other than the alias's own.
 */
type AliasConfig<P extends keyof CommandRegistry> = {
  aliasOf: AliasTarget<P>;
  options?: never;
  params?: never;
  description?: never;
  hidden?: never;
  helpArg?: never;
  handler?: never;
  beforeHandler?: never;
  afterHandler?: never;
};

type DefinedRootCommand<Options extends OptionsRecord> = {
  path: '';
  options: Options;
  params: Record<string, never>;
  helpArg: HelpArgConfig;
  handler?: (ctx: unknown) => void | Promise<void>;
  beforeHandler?: (ctx: unknown) => void | Promise<void>;
  afterHandler?: (ctx: unknown) => void | Promise<void>;
};

export function defineRootCommand<const Options extends OptionsRecord>(def: {
  options: Options;
  /** @default { enabled: true } */
  helpArg?: HelpArgConfig;
  handler?: (ctx: RootHandlerCtx<Options>) => void | Promise<void>;
  /** Runs before `handler`. Throwing aborts the handler and `afterHandler`. */
  beforeHandler?: (ctx: RootHandlerCtx<Options>) => void | Promise<void>;
  /** Runs after `handler` resolves. Skipped if `handler` or `beforeHandler` throws. */
  afterHandler?: (ctx: RootHandlerCtx<Options>) => void | Promise<void>;
}): DefinedRootCommand<Options> {
  return {
    params: {} as Record<string, never>,
    helpArg: { enabled: true },
    ...(def as object),
    path: '',
  } as DefinedRootCommand<Options>;
}

// biome-ignore lint/complexity/useMaxParams: DX — path-first call shape (path, def) is the declared API
export function defineCommand<P extends keyof CommandRegistry>(
  path: P,
  def: AliasConfig<P>,
): DefinedAliasCommand<P>;
export function defineCommand<
  P extends keyof CommandRegistry,
  const Options extends OptionsRecord,
  const Params extends Record<string, AnyParam> = Record<string, never>,
  // biome-ignore lint/complexity/useMaxParams: DX — path-first call shape (path, def) is the declared API
>(
  path: P,
  def: {
    options: Options;
    /** @default { enabled: true } */
    helpArg?: HelpArgConfig;
    description?: string;
    /** Omit this command from parent help listings. It can still be invoked and `--help`'d directly. */
    hidden?: boolean;
    handler?: (ctx: HandlerCtx<P, Options, Params>) => void | Promise<void>;
    /** Runs before `handler`. Throwing aborts the handler and `afterHandler`. */
    beforeHandler?: (ctx: HandlerCtx<P, Options, Params>) => void | Promise<void>;
    /** Runs after `handler` resolves. Skipped if `handler` or `beforeHandler` throws. */
    afterHandler?: (ctx: HandlerCtx<P, Options, Params>) => void | Promise<void>;
  } & ParamsConstraint<P & string> &
    (Params extends Record<string, never>
      ? unknown
      : { params: Params } & { params: StrictParams<P & string, Params> }),
): DefinedCommand<P, Options, Params>;
// biome-ignore lint/complexity/useMaxParams: DX — path-first call shape (path, def) is the declared API
export function defineCommand(path: string, def: object): object {
  if ('aliasOf' in def) {
    return {
      options: {},
      helpArg: { enabled: true },
      ...def,
      path,
    };
  }
  return {
    params: {},
    helpArg: { enabled: true },
    ...def,
    path,
  };
}
