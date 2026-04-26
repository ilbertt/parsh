---
name: parsh-env
description: How to use @parsh/env for typed, lazy environment-variable access in a parsh CLI. Use when adding env vars to a CLI, or when you see a handler reading `process.env` directly. Pairs with the parsh skill — read that first if you don't know how parsh CLIs are structured.
---

# parsh-env

[`@parsh/env`](https://www.npmjs.com/package/@parsh/env) gives a parsh CLI a typed, lazy `ctx.context.env` for environment variables. It validates each variable with [Standard Schema v1](https://standardschema.dev) (Zod, Valibot, ArkType, …) the first time a handler reads it — subcommands that never touch a variable never pay the cost or throw on a missing one.

For the broader parsh workflow (commands, codegen, `Register`), see [`../parsh/SKILL.md`](../parsh/SKILL.md).

## When to use

- The user asks to add an env var to a parsh CLI.
- A handler is reading `process.env.X` directly — replace with `ctx.context.env.X`.
- The CLI needs config that depends on the deployment environment (DB URL, ports, feature flags, secrets).

**Do not use** for CLI flags — those go in `defineCommand({ options: … })`. `@parsh/env` is exclusively for `process.env`-style variables.

## Install

```sh
bun add @parsh/env
```

## Setup

Inject `createEnvContext` into `createCli`'s `context`, and register the `Cli` so the types propagate.

```ts
// src/main.ts
import { createCli } from '@parsh/core';
import { createEnvContext } from '@parsh/env';
import { z } from 'zod';
import { commandTree } from './commandTree.gen.ts';

const cli = createCli({
  programName: 'mycli',
  tree: commandTree,
  context: {
    env: createEnvContext({
      vars: {
        PORT: { schema: z.number().int().positive(), default: 3000 },
        DATABASE_URL: { schema: z.url() },
        NODE_ENV: { schema: z.enum(['development', 'production']) },
      },
    }),
  },
});

declare module '@parsh/core' {
  interface Register {
    cli: typeof cli;
  }
}

await cli.main();
```

The `declare module` block is **required** — without it, `ctx.context` is invisible to TypeScript.

## Reading variables in a handler

Registered context lives under `ctx.context`, so the typed env reads as `ctx.context.env.<KEY>`:

```ts
defineCommand('serve', {
  options: {},
  handler: ({ context, print }) => {
    context.env.PORT;          // number
    context.env.DATABASE_URL;  // string (validated URL)
    context.env.NODE_ENV;      // 'development' | 'production'
    context.env.FOO;           // ❌ compile-time TypeScript error
    print.info(`listening on ${context.env.PORT}`);
  },
});
```

Each variable is validated lazily, **on first access**. Once validated, the value is cached for the lifetime of the run.

## Coercion

`@parsh/env` tries the raw string as-is, then numerically, then as a boolean — first success wins. So `z.number()` and `z.boolean()` work without `z.coerce.*`:

```ts
vars: {
  PORT:    { schema: z.number().int().positive() },                 // PORT=8080
  ENABLED: { schema: z.boolean() },                                 // ENABLED=true
  TAGS:    { schema: z.string().transform((s) => s.split(',')) },   // TAGS=a,b,c
}
```

## Defaults

Provide `default` to make a variable optional. The default is returned when the source has no value (`undefined` or empty string) and **bypasses the schema** — supply a value already in the schema's output type.

```ts
vars: {
  PORT: { schema: z.number().int().positive(), default: 3000 },
}
```

Without a default, reading a missing variable throws `EnvMissingError`. An invalid value throws `EnvValidationError`.

## Remapping the variable name

If the in-code key should differ from the env var name, pass `name`:

```ts
vars: {
  databaseUrl: { name: 'DATABASE_URL', schema: z.url() },
}
// access: ctx.context.env.databaseUrl   (reads process.env.DATABASE_URL)
```

## Custom source

By default the source is `process.env`. Pass `source` to override — useful for tests or for reading from a parsed `.env` snapshot.

```ts
createEnvContext({
  source: { PORT: '8080', DATABASE_URL: 'postgres://…' },
  vars: { … },
});
```

## Common mistakes

- **Reading `process.env.X` directly inside a handler.** Use `ctx.context.env.X` instead — typed, validated, lazy.
- **Looking on `ctx.env` instead of `ctx.context.env`.** Registered context always lives under `ctx.context`. The flat `ctx.env` doesn't exist.
- **Forgetting the `Register` augmentation.** Without it, `ctx.context` is invisible at the type level. See the [parsh skill](../parsh/SKILL.md#shared-context).
- **Using `z.coerce.*` for numbers/booleans.** Not needed — `@parsh/env` coerces automatically.
- **Putting CLI flags in `vars`.** Flags go in `defineCommand({ options: … })`, not in env.
