# parsh

Build type-safe CLIs in TypeScript.

- **File-based commands router** - inspired by TanStack Router.
- **Inherited options** — parent options flow into every descendant, fully typed.
- **Schema-agnostic** - validate options and params with any [Standard Schema](https://standardschema.dev) library (Zod, Valibot, ...).
- **Extensible context** - inject shared services once, access them typed in every handler.
- **Schemas are types** — params, options, and context infer end-to-end. Mistyped keys are compile errors.
- **Headless core** — no Ink, chalk, or terminal deps. Plug in whatever TUI you want.

## For Agents

Guidelines and instructions on how to build amazing CLI applications are available in the [`skills/`](skills/) folder.

## Quick start

```sh
bun add @parsh/core
bun add -d @parsh/codegen
```

```ts
// src/commands/_root.ts
import { defineRootCommand } from '@parsh/core';
import { z } from 'zod';

export const command = defineRootCommand({
  options: {
    verbose: { schema: z.boolean().optional(), forwardToChildren: true },
  },
});
```

```ts
// src/commands/hello.ts
import { defineCommand } from '@parsh/core';
import { z } from 'zod';

export const command = defineCommand('hello', {
  description: 'Say hello.',
  options: { name: { schema: z.string().default('world') } },
  handler: ({ options, rootOptions, print }) => {
    if (rootOptions.verbose) {
      print.dim(`greeting ${options.name}…`);
    }
    print.success(`hello, ${options.name}`);
  },
});
```

```sh
parsh-codegen generate --commands src/commands --out src/commandTree.gen.ts
```

```ts
// src/main.ts
import { createCli } from '@parsh/core';
import { commandTree } from './commandTree.gen.ts';

await createCli({ programName: 'mycli', tree: commandTree }).main();
```

## Why parsh

**Options and params are typed from their schemas.** No generics, no casts.

```ts
defineCommand('deploy [env]', {
  params: { env: { schema: z.enum(['staging', 'prod']) } },
  options: { force: { schema: z.boolean().optional() } },
  handler: ({ params, options }) => {
    params.env;     // 'staging' | 'prod'
    options.force;  // boolean | undefined
    options.foo;    // throws a compile-time TypeScript error
  },
});
```

**Forwarded options flow into descendants, fully typed.**

```ts
// _root.ts
defineRootCommand({
  options: { region: { schema: z.string().default('eu-west-2'), forwardToChildren: true } },
});

// s3/buckets/list.ts
defineCommand('s3 buckets list', {
  options: {},
  handler: ({ rootOptions }) => {
    rootOptions.region;   // string
    rootOptions.bar;      // throws a compile-time TypeScript error
  },
});
```

**Help is auto-generated, colored, and respects `NO_COLOR`.** No need to wire up usage strings, format flags, or pull in chalk — `--help` works on the root and on every subcommand out of the box.

```text
$ awslike --help
A fake AWS CLI.

Usage: awslike <command> [options]

Options:
  --identity    AWS account identity (required for every command).
  --region, -r  AWS region. Defaults to eu-west-2.

Commands:
  configure                   Persist access/secret keys to disk for later use.
  s3                          Manage S3 buckets and objects.
  s3 buckets list             List S3 buckets.
  s3 buckets <name> create    Create a new S3 bucket.
  …
```

**Shared context is injected and typed on every handler under `ctx.context`.** Register the `Cli` once, then `ctx.context.db`, `ctx.context.env`, `ctx.context.files` light up everywhere — separated from framework-provided fields so nothing collides.

```ts
const cli = createCli({
  programName: 'mycli',
  tree: commandTree,
  context: {
    db: createDbClient(),
    env: createEnvContext({ vars: { DATABASE_URL: { schema: z.url() } } }),
  },
});

declare module '@parsh/core' {
  interface Register { cli: typeof cli }
}

// any handler, anywhere:
defineCommand('migrate', {
  options: {},
  handler: async (ctx) => {
    ctx.context.env.DATABASE_URL;   // string
    await ctx.context.db.query(/* ... */);
    ctx.context.foo;                // throws a compile-time TypeScript error
  },
});
```

**Every handler gets a `ctx.print` helper for colored, leveled output.** No need to import chalk or write to `process.stderr` by hand.

```ts
defineCommand('deploy', {
  options: {},
  handler: ({ print }) => {
    print.info('starting deploy…');     // plain
    print.success('deploy complete');   // green
    print.warn('config is stale');      // yellow → stderr
    print.error('failed to push image');// red → stderr
    print.dim('took 12.4s');            // dim
  },
});
```

## Examples

| Example | What it shows |
| --- | --- |
| [`awslike`](examples/awslike) | Deeply nested commands modeled after the AWS CLI (`s3 buckets [name] create`), `forwardToChildren` flags inherited down the tree, and `@parsh/files` for credentials on disk. |
| [`pomo`](examples/pomo) | Pomodoro timer with a live [Ink](https://github.com/vadimdemedes/ink) TUI rendered from inside a handler. Demonstrates that core stays headless — any TUI library plugs in. |
| [`env-vars`](examples/env-vars) | `@parsh/env` with `createEnvContext` for typed, lazy `process.env` access (`PORT`, `NODE_ENV`, `DATABASE_URL`). |
| [`config-store`](examples/config-store) | `@parsh/files` for typed JSON config in `~/.config/mycli/`, with `ensureExists()` gating reads via `beforeHandler`. |
| [`scaffold`](examples/scaffold) | A `create-app`-style wizard built with [`@clack/prompts`](https://github.com/bombshell-dev/clack) — options can fall back to interactive prompts when absent. |

## Core Packages

| Package | Description |
| --- | --- |
| [`@parsh/core`](packages/core/pkg) | The router. `defineCommand`, `createCli`, types. |
| [`@parsh/codegen`](packages/codegen/pkg) | `parsh-codegen` CLI that walks `commands/` and emits `commandTree.gen.ts`. |

## Add-on Packages

| Package | Description |
| --- | --- |
| [`@parsh/env`](packages/env/pkg) | Typed, lazy `process.env` access for the cli's `ctx`. |
| [`@parsh/files`](packages/files/pkg) | Typed JSON file storage for the cli's `ctx`. |
