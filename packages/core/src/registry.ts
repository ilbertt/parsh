/**
 * Shape every entry in `CommandRegistry` conforms to.
 *
 * The entry is populated by the generated `commandTree.gen.ts` emitted by
 * `@parsh/codegen`, with intersections precomputed (never via recursive
 * conditional types at use sites).
 *
 * - `own`            — args declared on this command.
 * - `inherited`      — args accumulated from every ancestor, flattened.
 * - `ctx`            — extension fields merged into handler ctx (reserved for future use).
 * - `params`         — positional params introduced by this level's bracket segment(s).
 * - `inheritedParams`— params accumulated from ancestors.
 */
export interface CommandEntry {
  own: object;
  inherited: object;
  ctx: object;
  params: object;
  inheritedParams: object;
}

/**
 * The augmentation point. Generated files add entries here via
 * `declare module '@parsh/core'`.
 */
// biome-ignore lint/suspicious/noEmptyInterface: intentional augmentation point
export interface CommandRegistry {}

/** Flatten a nested intersection into a single object type for readable IntelliSense. */
export type Simplify<T> = { [K in keyof T]: T[K] } & {};
