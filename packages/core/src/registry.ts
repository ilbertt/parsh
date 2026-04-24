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

export type Simplify<T> = { [K in keyof T]: T[K] } & {};
