import type { CommandEntry, CommandRegistry, Simplify } from '#registry.ts';
import type { AnySchema, InferArgs } from '#schema.ts';

/**
 * Extract the last space-separated segment of a path string.
 * `'users [id] edit'` → `'edit'`
 */
type LastSegment<P extends string> = P extends `${string} ${infer Rest}` ? LastSegment<Rest> : P;

/**
 * The param name introduced by this command's own (last) segment, or `never` if
 * the last segment is a literal.
 */
type OwnParamName<P extends string> = LastSegment<P> extends `[${infer N}]` ? N : never;

/**
 * Shape of the `params` field in `defineCommand(path, def)`:
 * - path has no bracket in its last segment → `params` optional, must be empty.
 * - path ends in `[name]` → `params` required with exactly one key `name`.
 */
export type ParamsConstraint<P extends string> = [OwnParamName<P>] extends [never]
  ? { params?: Record<string, never> }
  : { params: { [K in OwnParamName<P>]: AnySchema } };

type OwnParamsOf<P extends string, Params extends Record<string, AnySchema>> = [
  OwnParamName<P>,
] extends [never]
  ? Record<string, never>
  : InferArgs<Params>;

/**
 * Per-command handler ctx. `args` / `params` are the command's OWN fields,
 * inferred locally from the `args` / `params` literals. Ancestor contributions
 * live under `parents` keyed by the ancestor's path string; root args live
 * under `root.args`.
 */
export type HandlerCtx<
  P extends keyof CommandRegistry,
  Args extends Record<string, AnySchema>,
  Params extends Record<string, AnySchema>,
> = CommandRegistry[P] extends CommandEntry
  ? Simplify<{
      args: Simplify<InferArgs<Args>>;
      params: Simplify<OwnParamsOf<P & string, Params>>;
      parents: CommandRegistry[P]['parents'];
      root: CommandRegistry[P]['root'];
    }>
  : never;

export type HelpArgConfig = { enabled: boolean };

export type DefinedCommand<
  P extends keyof CommandRegistry,
  Args extends Record<string, AnySchema>,
  Params extends Record<string, AnySchema>,
> = {
  path: P;
  args: Args;
  params: Params;
  helpArg: HelpArgConfig;
  handler?: (ctx: unknown) => void | Promise<void>;
};

export function defineCommand<
  P extends keyof CommandRegistry,
  const Args extends Record<string, AnySchema>,
  const Params extends Record<string, AnySchema> = Record<string, never>,
  // biome-ignore lint/complexity/useMaxParams: DX — path-first call shape (path, def) is the declared API
>(
  path: P,
  def: {
    args: Args;
    helpArg?: HelpArgConfig;
    handler?: (ctx: HandlerCtx<P, Args, Params>) => void | Promise<void>;
  } & ParamsConstraint<P & string> &
    (Params extends Record<string, never> ? unknown : { params: Params }),
): DefinedCommand<P, Args, Params> {
  return {
    params: {} as Params,
    helpArg: { enabled: true },
    ...(def as object),
    path,
  } as DefinedCommand<P, Args, Params>;
}
