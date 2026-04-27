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

Register custom error classes via `errors` and centralize their handling in `onError`. The discriminant is `static readonly code` on each class, so the inferred `code` literal narrows `error` and lets you map exit codes per error type:

```ts
class NotAuthorized extends Error {
  static readonly code = 'NotAuthorized' as const;
}
class RateLimited extends Error {
  static readonly code = 'RateLimited' as const;
  constructor(public retryAfter: number) {
    super(`rate limited (retry after ${retryAfter}s)`);
  }
}

createCli({
  programName: 'awslike',
  tree: commandTree,
  errors: { NotAuthorized, RateLimited },
  onError: ({ code, error, ctx, exit }) => {
    if (code === 'NotAuthorized') {
      ctx.print.error(error.message);
      return exit(77);
    }
    if (code === 'RateLimited') {
      ctx.print.warn(`retry after ${error.retryAfter}s`);
      return exit(75);
    }
  },
});
```

`code` is the union of every registered class's static `code` plus four built-ins:

- `'PARSE'` — argv parsing or unknown-command failure.
- `'VALIDATION'` — option/param schema rejection.
- `'LOAD'` — `commands/<path>` import or load failure (`error` is `CommandLoadError`).
- `'UNKNOWN'` — a handler threw something not registered in `errors`.

`ctx` is the same shape your handler sees (options, params, parents, rootOptions, print, context), but is `undefined` for `'PARSE'`/`'VALIDATION'`/`'LOAD'` since those fail before the handler context is built.

Return `exit(n)` to set the exit code and suppress the default stderr line. Return `void` to fall through to the default rendering. Throws inside `onError` itself surface as `app: onError threw: …` and exit `1` — they do not recurse.

The `instanceof` walk follows the insertion order of `errors`, so register most-specific subclasses first (otherwise a parent class will catch its child instances). Class names matching a built-in code (`PARSE`, `VALIDATION`, `LOAD`, `UNKNOWN`) are rejected at compile time.

Pair with [`@parshjs/env`](https://www.npmjs.com/package/@parshjs/env) for typed env vars and [`@parshjs/files`](https://www.npmjs.com/package/@parshjs/files) for typed JSON storage.
