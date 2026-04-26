# @parsh/files

Typed JSON file storage for [`@parsh/core`](https://www.npmjs.com/package/@parsh/core) handler `ctx`.

- **Standard Schema v1** — bring your own validator (Zod, Valibot, ArkType, …).
- **Typed handles** — each file gets a `read()` / `write()` API typed from its schema.
- **Atomic writes** — write-via-rename, never half-written JSON on disk.
- **Helpers** — `osHomeDir()` and `osHomeConfigDir()` for cross-platform default base paths.

## Install

```sh
bun add @parsh/files
```

## Usage

```ts
import { join } from 'node:path';
import { createCli } from '@parsh/core';
import { createFilesContext, osHomeConfigDir } from '@parsh/files';
import { z } from 'zod';
import { commandTree } from './commandTree.gen.ts';

const cli = createCli({
  programName: 'awslike',
  tree: commandTree,
  context: {
    files: createFilesContext({
      basePath: join(osHomeConfigDir(), 'awslike'),
      files: {
        credentials: {
          filename: 'credentials.json',
          schema: z.object({ accessKey: z.string(), secretKey: z.string() }),
        },
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

Inside any handler, `ctx.context.files` is typed from the file specs you declared (registered context lives under `ctx.context`):

```ts
defineCommand('login', {
  options: {},
  handler: async ({ context }) => {
    const creds = await context.files.credentials.read();    // { accessKey: string; secretKey: string }
    await context.files.credentials.write({ accessKey: 'AKIA…', secretKey: '…' });
    context.files.credentials.write({ foo: 'bar' });         // throws a compile-time TypeScript error
    context.files.unknown;                                   // throws a compile-time TypeScript error
  },
});
```
