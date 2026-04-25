import type { CommandEntry, CommandRegistry, Simplify } from '#registry.ts';
import type { AnySchema, InferSchemas } from '#schema.ts';

type LastSegment<P extends string> = P extends `${string} ${infer Rest}` ? LastSegment<Rest> : P;

type OwnParamName<P extends string> = LastSegment<P> extends `[${infer N}]` ? N : never;

/**
 * - path has no bracket in its last segment → `params` optional, must be empty.
 * - path ends in `[name]` → `params` required with exactly one key `name`.
 */
type ParamsConstraint<P extends string> = [OwnParamName<P>] extends [never]
  ? { params?: Record<string, never> }
  : { params: { [K in OwnParamName<P>]: AnySchema } };

type OwnParamsOf<P extends string, Params extends Record<string, AnySchema>> = [
  OwnParamName<P>,
] extends [never]
  ? Record<string, never>
  : InferSchemas<Params>;

type HandlerCtx<
  P extends keyof CommandRegistry,
  Options extends Record<string, AnySchema>,
  Params extends Record<string, AnySchema>,
> = CommandRegistry[P] extends CommandEntry
  ? Simplify<{
      options: Simplify<InferSchemas<Options>>;
      params: Simplify<OwnParamsOf<P & string, Params>>;
      parents: CommandRegistry[P]['parents'];
      root: CommandRegistry[P]['root'];
    }>
  : never;

type HelpArgConfig = { enabled: boolean };

type DefinedCommand<
  P extends keyof CommandRegistry,
  Options extends Record<string, AnySchema>,
  Params extends Record<string, AnySchema>,
> = {
  path: P;
  options: Options;
  params: Params;
  helpArg: HelpArgConfig;
  handler?: (ctx: unknown) => void | Promise<void>;
};

type DefinedRootCommand<Options extends Record<string, AnySchema>> = {
  path: '';
  options: Options;
  params: Record<string, never>;
  helpArg: HelpArgConfig;
  handler?: (ctx: unknown) => void | Promise<void>;
};

export function defineRootCommand<const Options extends Record<string, AnySchema>>(def: {
  options: Options;
  /** @default { enabled: true } */
  helpArg?: HelpArgConfig;
  handler?: (ctx: { options: Simplify<InferSchemas<Options>> }) => void | Promise<void>;
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
  const Options extends Record<string, AnySchema>,
  const Params extends Record<string, AnySchema> = Record<string, never>,
  // biome-ignore lint/complexity/useMaxParams: DX — path-first call shape (path, def) is the declared API
>(
  path: P,
  def: {
    options: Options;
    /** @default { enabled: true } */
    helpArg?: HelpArgConfig;
    handler?: (ctx: HandlerCtx<P, Options, Params>) => void | Promise<void>;
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
