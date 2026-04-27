# Troubleshooting

Things that go wrong and how to recognize them.

## `ctx` is `any` / `unknown` / wrong

By far the most common failure. Almost always caused by a stale `commandTree.gen.ts`.

**First step, every time:**

```sh
parsh-codegen generate
```

If that doesn't fix it, check in this order:

1. Did you create the file at the **exact location** matching the path string? `defineCommand('a b c', …)` must live at `commands/a/b/c.ts` (or `commands/a/b/c/_root.ts` for a routing group with descendants).
2. Does the file `export const command = defineCommand(…)`? The codegen looks for the named `command` export.
3. Is the file named with one of the codegen's filters? It **ignores** `*.gen.ts`, `*.test.ts`, and any `_*` filename other than `_root.ts`.
4. Did you import `defineCommand` / `defineRootCommand` from `@parshjs/core` (or the workspace alias) and **not** redefine them locally?

## TS errors after renaming a path or a param

A rename changes the path string. The old entry stays in `commandTree.gen.ts` until you regenerate, and the new entry isn't there yet — so call sites referencing `parents['<new path>']` won't compile.

**Fix:** `parsh-codegen generate` (or keep `--watch` running while you iterate).

If you renamed a `[name]` segment, the `params` object key needs to match the new bracket name in the same edit, or TypeScript will reject the `defineCommand` call before the codegen even runs.

## "Wrong key, missing key, or extra key" errors on `params`

The path string and the `params` object disagree.

```ts
// path declares [id]
defineCommand('users [id]', {
  params: { name: { schema: z.string() } }, // ❌ key 'name' not in path
});
```

The path string is the source of truth. Either fix the path or fix the `params` keys to match exactly.

## Handler can't see a registered shared context field

Two common causes:

**1. You're looking on the wrong place on `ctx`.** Registered context lives under `ctx.context`, not flat on `ctx`:

```ts
// ❌ wrong — looks for a framework field that isn't there
handler: ({ db }) => { /* … */ }

// ✅ right — registered context is under ctx.context
handler: ({ context }) => { context.db /* … */ }
```

**2. You forgot the `declare module` block.**

```ts
// in the same file as createCli:
declare module '@parshjs/core' {
  interface Register {
    cli: typeof cli;
  }
}
```

Without it, `ctx.context` is invisible to TypeScript. Place it **once**, in the same file as `createCli`, and only register one `Cli` per process.

## `ctx.context` is `never`

You're trying to read `ctx.context` from a CLI created **without** a `context` field. That's deliberate: `RegisteredContext` resolves to `never` when no context is configured, so handlers don't silently read `undefined`.

**Fix:** either pass `context` to `createCli`, or remove the `ctx.context.*` access.

## Alias collisions

`Cli` construction throws if an option's `aliases` collide with a sibling option, the option's own `name`, or a forwarded ancestor option visible on the same command. The error message names the conflicting alias and command — read it and rename one side.

## Forwarded option not visible on a child

`forwardToChildren: true` only propagates to **descendants of the declaring command**. If you want a flag visible everywhere, declare it on the **root** with `forwardToChildren: true`. Declaring it on a deep parent only forwards within that subtree.

## "Command not found" at runtime

Either the command file isn't where the path string says it should be, or you forgot to regenerate. The runtime tree lives in `commandTree.gen.ts`; the runner won't see a command that isn't in there.

## My non-`.ts` file under `commands/` was ignored

Expected — the codegen only walks `.ts` files. (Also: it ignores `*.gen.ts`, `*.test.ts`, and `_*` other than `_root.ts`.)

## Watch mode didn't pick up a change

Watch mode triggers on add / remove / rename of files matching the include filter. Pure content edits to an existing file don't trigger regeneration — and they don't need to, since the path string and the `params` / `options` key shapes are what the generated file depends on. If you renamed a path or added a `[name]` segment by editing in place, save the file with a name change (or just run `parsh-codegen generate` once).
