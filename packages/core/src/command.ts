import type { CommandEntry, CommandRegistry, Simplify } from '#registry.ts';
import type { AnySchema } from '#schema.ts';

export type HandlerCtx<P extends keyof CommandRegistry> = CommandRegistry[P] extends CommandEntry
  ? Simplify<
      {
        args: Simplify<CommandRegistry[P]['own'] & CommandRegistry[P]['inherited']>;
        params: Simplify<CommandRegistry[P]['params'] & CommandRegistry[P]['inheritedParams']>;
      } & CommandRegistry[P]['ctx']
    >
  : never;

/**
 * Source-of-truth constraint for `params`: the path string declares which params
 * exist; the `params` object declares their schemas. Keys must match exactly.
 * - Registry entry with empty `params` → field is optional, must be empty if present.
 * - Registry entry with non-empty `params` → field is required, keys must match exactly.
 */
export type ParamsConstraint<P extends keyof CommandRegistry> =
  CommandRegistry[P] extends CommandEntry
    ? keyof CommandRegistry[P]['params'] extends never
      ? { params?: Record<string, never> }
      : { params: { [K in keyof CommandRegistry[P]['params']]: AnySchema } }
    : never;

export type CommandDef<P extends keyof CommandRegistry> = {
  args: Record<string, AnySchema>;
  handler?: (ctx: HandlerCtx<P>) => void | Promise<void>;
} & ParamsConstraint<P>;

export type DefinedCommand<
  P extends keyof CommandRegistry,
  Args extends Record<string, AnySchema>,
> = {
  path: P;
  args: Args;
  handler?: (ctx: HandlerCtx<P>) => void | Promise<void>;
} & ParamsConstraint<P>;

export function defineCommand<
  P extends keyof CommandRegistry,
  const Args extends Record<string, AnySchema>,
  // biome-ignore lint/complexity/useMaxParams: DX — path-first call shape (path, def) is the declared API
>(
  path: P,
  def: { args: Args; handler?: (ctx: HandlerCtx<P>) => void | Promise<void> } & ParamsConstraint<P>,
): DefinedCommand<P, Args> {
  return { ...def, path } as DefinedCommand<P, Args>;
}
