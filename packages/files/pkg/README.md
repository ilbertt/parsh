# @parshjs/files

[![npm version](https://img.shields.io/npm/v/@parshjs/files.svg)](https://www.npmjs.com/package/@parshjs/files)
[![license](https://img.shields.io/npm/l/@parshjs/files.svg)](https://www.npmjs.com/package/@parshjs/files)

Typed JSON file storage for [`@parshjs/core`](https://www.npmjs.com/package/@parshjs/core) handler `ctx`.

- **Standard Schema v1** — bring your own validator (Zod, Valibot, ArkType, …).
- **Typed handles** — each file gets a `read()` / `write()` / `update()` API typed from its schema.
- **Atomic writes** — write-via-rename, never half-written JSON on disk.
- **Defaults** — declare `defaults` on a spec and `read()` returns them when the file is missing.
- **Stateful handles** — `await handle.load()` for sync `.value` access plus async partial writes.
- **Helpers** — `osHomeDir()` and `osHomeConfigDir()` for cross-platform default base paths.

## Install

```sh
npm install @parshjs/files
```

## Usage

```ts
import { join } from 'node:path';
import { createCli } from '@parshjs/core';
import { createFilesContext, osHomeConfigDir } from '@parshjs/files';
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

declare module '@parshjs/core' {
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
    await context.files.credentials.update({ accessKey: 'NEW' }); // shallow-merge + atomic write
    context.files.credentials.write({ foo: 'bar' });         // throws a compile-time TypeScript error
    context.files.unknown;                                   // throws a compile-time TypeScript error
  },
});
```

## Defaults

Declare `defaults` on a spec and `read()` returns them when the file is missing — no more `(await file.maybeRead()) ?? DEFAULTS` at every call site. The defaults are returned in memory only; nothing is written to disk until something calls `write()`, `update()`, `set()`, or `replace()`.

```ts
files: {
  prefs: {
    filename: 'prefs.json',
    schema: z.object({ region: z.string(), color: z.boolean() }),
    defaults: { region: 'us-east-1', color: true },
  },
},
```

## Stateful handle

For consumers that need synchronous field access (constructing clients at startup, reads inside a UI loop), call `load()` to materialize a stateful handle. It loads the file once into memory and exposes `.value` synchronously plus async partial writes. `load()` is idempotent — call it from as many `beforeHandler`s as you like; only the first call hits disk.

```ts
const config = await context.files.prefs.load();
config.value.region;                          // sync
await config.set({ region: 'eu-west-2' });    // shallow-merge + atomic write, updates `.value`
await config.replace({ region: 'us', color: false }); // full overwrite
await config.reload();                        // re-read from disk (only needed if something else wrote to the file)
```

`set()` and `replace()` keep `.value` in sync with disk automatically — `reload()` is only for the case where something *outside* this handle modified the file (another process, a hand-edit). The stateful handle assumes single-process ownership of the file.
