# Shared context and lifecycle

Reference for wiring shared dependencies onto every handler, and for the per-command lifecycle hooks.

For typed env vars, see the [`parsh-env` skill](../../parsh-env/SKILL.md). For typed JSON file storage, see the [`parsh-files` skill](../../parsh-files/SKILL.md).

## The shape of `ctx`

Every handler receives a `ctx` with **framework-provided fields** (always present) and a **user-provided field** (registered context):

| Field | Provided by | Always present? |
| --- | --- | --- |
| `ctx.options` | framework — this command's own options | yes |
| `ctx.params` | framework — this command's own params | yes |
| `ctx.parents['<path>']` | framework — ancestor commands' options/params | yes |
| `ctx.rootOptions` | framework — root command's options | yes |
| `ctx.print` | framework — colored output helper | yes |
| `ctx.context` | user — whatever you passed to `createCli({ context })` | only if `context` was configured (`never` otherwise) |

The split exists so the framework can add fields freely without ever colliding with user keys — and so it's visually obvious which `ctx.x` lookups are framework primitives vs. your own dependencies.

## Registering a shared context

`createCli({ context })` accepts an object whose fields show up on every handler's `ctx.context`. **You must register the `Cli` instance** with a `declare module` block — without it, `ctx.context` is invisible to TypeScript.

```ts
// src/main.ts
import { createCli } from '@parsh/core';
import { commandTree } from './commandTree.gen.ts';

const cli = createCli({
  programName: 'mycli',
  tree: commandTree,
  context: {
    db: connectToDatabase(),
    now: () => new Date(),
  },
});

declare module '@parsh/core' {
  interface Register {
    cli: typeof cli;
  }
}

await cli.main();
```

Now in any handler:

```ts
defineCommand('migrate', {
  options: {},
  handler: async ({ context, print }) => {
    context.now();                  // Date
    await context.db.query(/* … */);
    print.success('migrated');
  },
});
```

Rules:

- Place the `declare module` block **once**, in the same file as `createCli`.
- The `Register` augmentation is global to the process. **Only one `Cli` per process.**
- If the CLI was created **without** a `context`, `ctx.context` resolves to `never` — reading it is a loud type error rather than silent `undefined` access.
- Pick any keys you like inside `context` — they'll never collide with framework fields, since they live one level down under `ctx.context`.

## Factory contexts

Pass a function instead of an object when context construction has side effects (opening connections, reading files) you don't want to run at module load. The factory runs **once per `cli.main()` call**, so each invocation gets a fresh context.

```ts
const cli = createCli({
  programName: 'mycli',
  tree: commandTree,
  context: () => ({
    db: connectToDatabase(),
    requestId: crypto.randomUUID(),
  }),
});
```

Async factories work too: `context: async () => ({ … })`.

## Lifecycle hooks

Each command supports three hooks. All three see the same fully-typed `ctx`.

```ts
defineCommand('deploy', {
  options: { env: { schema: z.enum(['staging', 'prod']) } },
  beforeHandler: async (ctx) => {
    /* runs first */
  },
  handler: async (ctx) => {
    /* main body */
  },
  afterHandler: async (ctx) => {
    /* runs after handler resolves */
  },
});
```

Semantics:

- **`beforeHandler` runs first.** Throwing skips both `handler` and `afterHandler`. This is the right place for "must be configured / authenticated / valid" gates.
- **`handler` runs only if `beforeHandler` did not throw.**
- **`afterHandler` runs after `handler` resolves.** Skipped if `handler` or `beforeHandler` throws.

A common pattern: combine `beforeHandler` with `@parsh/files`'s `ensureExists()` to fail fast with a friendly message before the handler runs — see the [`parsh-files` skill](../../parsh-files/SKILL.md) for an end-to-end example.
