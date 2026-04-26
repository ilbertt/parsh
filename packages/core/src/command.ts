import type { Print } from '#print.ts';
import type { CommandEntry, CommandRegistry, RegisteredContext, Simplify } from '#registry.ts';
import type { AnyParam, InferOptions, InferParams, OptionsRecord } from '#schema.ts';

type LastSegment<P extends string> = P extends `${string} ${infer Rest}` ? LastSegment<Rest> : P;

type OwnParamName<P extends string> = LastSegment<P> extends `[${infer N}]` ? N : never;

/**
 * - path has no bracket in its last segment → `params` field is forbidden.
 * - path ends in `[name]` → `params` required with exactly one key `name`.
 */
type ParamsConstraint<P extends string> = [OwnParamName<P>] extends [never]
  ? { params?: never }
  : { params: { [K in OwnParamName<P>]: AnyParam } };

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
  handler?: (ctx: unknown) => void | Promise<void>;
  beforeHandler?: (ctx: unknown) => void | Promise<void>;
  afterHandler?: (ctx: unknown) => void | Promise<void>;
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
    handler?: (ctx: HandlerCtx<P, Options, Params>) => void | Promise<void>;
    /** Runs before `handler`. Throwing aborts the handler and `afterHandler`. */
    beforeHandler?: (ctx: HandlerCtx<P, Options, Params>) => void | Promise<void>;
    /** Runs after `handler` resolves. Skipped if `handler` or `beforeHandler` throws. */
    afterHandler?: (ctx: HandlerCtx<P, Options, Params>) => void | Promise<void>;
  } & ParamsConstraint<P & string> &
    (Params extends Record<string, never> ? unknown : { params: Params }),
): DefinedCommand<P, Options, Params> {
  return {
    params: {} as Params,
    helpArg: { enabled: true },
    ...(def as object),
    path,
  } as DefinedCommand<P, Options, Params>;
}
