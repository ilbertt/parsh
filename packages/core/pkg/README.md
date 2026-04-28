# @parshjs/core

[![npm version](https://img.shields.io/npm/v/@parshjs/core.svg)](https://www.npmjs.com/package/@parshjs/core)
[![license](https://img.shields.io/npm/l/@parshjs/core.svg)](https://www.npmjs.com/package/@parshjs/core)

Type-safe router for TypeScript CLIs.

- **Fully type-safe** — options, params, and shared context are typed end-to-end. Zero generics at call sites, autocomplete on every `ctx`.
- **Filesystem-driven** — commands are files under `commands/`, not a fluent chain. The directory layout *is* the command tree.
- **Schema-agnostic** — any [Standard Schema v1](https://standardschema.dev) validator (Zod, Valibot, ArkType, …). No runtime dep on a validator.
- **Auto-generated help** — `--help` works on the root and every subcommand out of the box, with colored, structured output (and `NO_COLOR` support). No usage strings to hand-write.
- **`ctx.print` helper** — every handler gets `print.info` / `success` / `warn` / `error` / `dim` for colored, leveled output (warn/error → stderr). No chalk required.
- **Headless rendering** — no terminal renderer, prompt lib, or spinner in core. Bring your own (Ink, clack, ora, …).

## Install

```sh
npm install @parshjs/core
npm install -D @parshjs/codegen
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

## Error handling

Register `Error` subclasses under `errors` and centralize handling in `onError`. The object key is the `code` surfaced to the hook; `code` narrows `error` to the matching instance type:

```ts
class NotAuthorized extends Error {}

createCli({
  programName: 'awslike',
  tree: commandTree,
  errors: { NotAuthorized },
  onError: ({ code, error, exit, print }) => {
    if (code === 'NotAuthorized') {
      print.error(error.message);
      return exit(1);
    }
    // void → fall through to default stderr + exit code
  },
});
```

## Aliases

Point one path at another with `aliasOf`. The alias inherits the target's options, params, description, and handler — there is nothing else to configure. The target must be a registered path with the same param shape; wrong target, missing target, or mismatched params are compile errors.

```ts
// commands/s3/ls.ts — paramless alias
import { defineCommand } from '@parshjs/core';

export const command = defineCommand('s3 ls', {
  aliasOf: 's3 buckets list',
});
```

```ts
// commands/s3/c/[name].ts — alias with a param
export const command = defineCommand('s3 c [name]', {
  aliasOf: 's3 buckets [name] create',
});
```

Aliases participate in help output: when both alias and target are reachable in the current view, the alias is folded into the target's row; otherwise it's listed separately as `(alias of ...)`.

Pair with [`@parshjs/env`](https://www.npmjs.com/package/@parshjs/env) for typed env vars and [`@parshjs/files`](https://www.npmjs.com/package/@parshjs/files) for typed JSON storage.
