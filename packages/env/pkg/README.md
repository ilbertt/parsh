# @parshjs/env

Typed, lazy environment-variable access for [`@parshjs/core`](https://www.npmjs.com/package/@parshjs/core) handler `ctx`.

- **Standard Schema v1** — bring your own validator (Zod, Valibot, ArkType, …).
- **Lazy** — variables are validated the first time a handler reads them. Subcommands that never touch a variable never pay the cost or risk a missing-env error.
- **Coercion built in** — raw strings are tried as-is, then numeric, then boolean. `z.number()` and `z.boolean()` work without `z.coerce.*`.

## Install

```sh
bun add @parshjs/env
```

## Usage

```ts
import { createCli } from '@parshjs/core';
import { createEnvContext } from '@parshjs/env';
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

declare module '@parshjs/core' {
  interface Register {
    cli: typeof cli;
  }
}

await cli.main();
```

Inside any handler, `ctx.context.env` is typed from the schemas you declared (registered context lives under `ctx.context`):

```ts
defineCommand('serve', {
  options: {},
  handler: ({ context }) => {
    context.env.PORT;          // number
    context.env.DATABASE_URL;  // string (validated URL)
    context.env.NODE_ENV;      // 'development' | 'production'
    context.env.FOO;           // throws a compile-time TypeScript error
  },
});
```

Pass `name` to remap the in-code key when it should differ from the variable name in the source:

```ts
vars: {
  databaseUrl: { name: 'DATABASE_URL', schema: z.url() },
}
```

By default the source is `process.env`; pass `source` to override.
