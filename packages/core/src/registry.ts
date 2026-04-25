/**
 * Populated by the generated `commandTree.gen.ts` via `declare module` with
 * precomputed ancestor intersections.
 *
 * The command's OWN `options` / `params` are intentionally absent: they are
 * inferred locally in `defineCommand`'s generics, which breaks what would
 * otherwise be a circular inference between `typeof cmd.options` and
 * `HandlerCtx<P>`.
 */
export interface CommandEntry {
  parents: Record<string, { options: object; params: object }>;
  root: { options: object };
}

// biome-ignore lint/suspicious/noEmptyInterface: intentional augmentation point
export interface CommandRegistry {}

/**
 * Augmentation point for binding a concrete `Cli` instance — and therefore its
 * `context` type — to the package globally. Mirrors TanStack Router's
 * `Register` pattern:
 *
 *     declare module '@parsh/core' {
 *       interface Register { cli: typeof cli }
 *     }
 *
 * Once registered, every `defineCommand` handler sees the resolved context
 * fields on its `ctx` with no per-call generics.
 */
// biome-ignore lint/suspicious/noEmptyInterface: intentional augmentation point
export interface Register {}

export type Simplify<T> = { [K in keyof T]: T[K] } & {};

/**
 * Resolves the runtime type of a `context` value passed to `createCli`. Strips
 * the factory wrapper and unwraps a Promise; non-object values collapse to `{}`
 * so the result is always safe to spread into a handler ctx.
 */
export type ResolveContext<C> = C extends (...args: never[]) => infer R
  ? Awaited<R> extends object
    ? Awaited<R>
    : Record<string, never>
  : C extends object
    ? C
    : Record<string, never>;

/**
 * Looks up the registered CLI's context type (already resolved by `createCli`).
 * Returns `{}` until the user augments `Register` with `cli: typeof cli`.
 */
export type RegisteredContext = Register extends { cli: { readonly _context: infer C } }
  ? C extends object
    ? C
    : Record<string, never>
  : Record<string, never>;
