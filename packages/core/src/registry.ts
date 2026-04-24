/**
 * Shape every entry in `CommandRegistry` conforms to.
 *
 * Populated by the generated `commandTree.gen.ts` emitted by `@parsh/codegen`
 * with precomputed ancestor intersections (never via recursive conditional
 * types at use sites).
 *
 * - `parents` — map of ancestor path string → their own `{ args, params }`.
 * - `root`    — args + params passed to `createCli({ args, ... })`.
 *
 * The command's OWN `args` / `params` are NOT carried here — they are inferred
 * locally in `defineCommand`'s generics, which keeps the registry free of any
 * back-reference to the current command and breaks what would otherwise be a
 * circular inference between `typeof cmd.args` and `HandlerCtx<P>`.
 */
export interface CommandEntry {
  parents: Record<string, { args: object; params: object }>;
  root: { args: object };
}

/**
 * The augmentation point. Generated files add entries here via
 * `declare module '@parsh/core'`.
 */
// biome-ignore lint/suspicious/noEmptyInterface: intentional augmentation point
export interface CommandRegistry {}

/** Flatten a nested intersection into a single object type for readable IntelliSense. */
export type Simplify<T> = { [K in keyof T]: T[K] } & {};
