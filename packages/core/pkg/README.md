# @parshjs/core

Type-safe router for TypeScript CLIs.

- **Fully type-safe** — options, params, and shared context are typed end-to-end. Zero generics at call sites, autocomplete on every `ctx`.
- **Filesystem-driven** — commands are files under `commands/`, not a fluent chain. The directory layout *is* the command tree.
- **Schema-agnostic** — any [Standard Schema v1](https://standardschema.dev) validator (Zod, Valibot, ArkType, …). No runtime dep on a validator.
- **Auto-generated help** — `--help` works on the root and every subcommand out of the box, with colored, structured output (and `NO_COLOR` support). No usage strings to hand-write.
- **`ctx.print` helper** — every handler gets `print.info` / `success` / `warn` / `error` / `dim` for colored, leveled output (warn/error → stderr). No chalk required.
- **Headless rendering** — no terminal renderer, prompt lib, or spinner in core. Bring your own (Ink, clack, ora, …).

## Install

```sh
bun add @parshjs/core
bun add -d @parshjs/codegen
```

## Define commands

The path string passed to `defineCommand` is the source of truth. Space-separated segments build the tree; `[name]` segments declare params.

```ts
// commands/_root.ts
import { defineRootCommand } from '@parshjs/core';
import { z } from 'zod';

export const command = defineRootCommand({
  options: {
    region: {
      schema: z.string().default('eu-west-2'),
      forwardToChildren: true,
      aliases: ['r'],
    },
  },
  handler: ({ options, print }) => {
    print.info(`region: ${options.region}`);
  },
});
```

```ts
// commands/s3/buckets/[name]/create.ts
import { defineCommand } from '@parshjs/core';
import { z } from 'zod';

export const command = defineCommand('s3 buckets [name] create', {
  description: 'Create a bucket.',
  params: { name: { schema: z.string() } },
  options: { public: { schema: z.boolean().optional() } },
  handler: ({ parents, options, rootOptions, print }) => {
    const name = parents['s3 buckets [name]'].params.name;
    const acl = options.public ? 'public-read' : 'private';
    print.success(`Creating ${name} (${acl}) in ${rootOptions.region}`);
  },
});
```

The path's `[name]` segment forces a `params: { name: ... }` declaration — wrong key, missing key, or extra key are compile errors. Children inherit params from ancestors without redeclaring them; reach them through `parents['<ancestor path>']`.

## Generate the tree

```sh
parsh-codegen generate --commands src/commands --out src/commandTree.gen.ts
```

The generated file is what makes `ctx` typed inside every handler — keep it under version control and regenerate after any change under `commands/` (the codegen has a `--watch` mode for dev).

## Run

```ts
// main.ts
import { createCli } from '@parshjs/core';
import { commandTree } from './commandTree.gen.ts';

await createCli({
  programName: 'awslike',
  programDescription: 'A fake AWS CLI.',
  tree: commandTree,
}).main();
```

## Shared context

Pass an object (or a factory) into `createCli({ context })` and register the `Cli` instance to make it visible on every handler under `ctx.context`:

```ts
const cli = createCli({
  programName: 'awslike',
  tree: commandTree,
  context: { db: connect(), now: () => new Date() },
});

declare module '@parshjs/core' {
  interface Register {
    cli: typeof cli;
  }
}

await cli.main();
```

In any handler, the registered context is typed under `ctx.context` — separate from framework-provided fields (`options`, `params`, `parents`, `root`, `print`) so nothing collides:

```ts
defineCommand('migrate', {
  options: {},
  handler: async ({ context, print }) => {
    context.now();              // Date
    await context.db.query(/* ... */);
    context.foo;                // throws a compile-time TypeScript error
    print.success('migrated');
  },
});
```

Pair with [`@parshjs/env`](https://www.npmjs.com/package/@parshjs/env) for typed env vars and [`@parshjs/files`](https://www.npmjs.com/package/@parshjs/files) for typed JSON storage.
