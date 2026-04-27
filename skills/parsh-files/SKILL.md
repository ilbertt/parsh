---
name: parsh-files
description: How to use @parshjs/files for typed JSON file storage in a parsh CLI. Use when adding persistent config or state to a CLI (credentials, user prefs, cached state) — anything written as JSON on disk. Pairs with the parsh skill — read that first if you don't know how parsh CLIs are structured.
---

# parsh-files

[`@parshjs/files`](https://www.npmjs.com/package/@parshjs/files) gives a parsh CLI a typed `ctx.context.files` for persistent JSON storage. Each file is declared with a [Standard Schema v1](https://standardschema.dev) schema (Zod, Valibot, ArkType, …); reads and writes are validated and atomic.

For the broader parsh workflow (commands, codegen, `Register`), see [`../parsh/SKILL.md`](../parsh/SKILL.md).

## When to use

Persistent CLI state — config, credentials, tokens, small caches. Not for large data, binary blobs, or hot-path I/O.

## Setup

Inject `createFilesContext` into `createCli`'s `context` and register the CLI so the types propagate.

```ts
// src/main.ts
import { join } from 'node:path';
import { createCli } from '@parshjs/core';
import { createFilesContext, osHomeConfigDir } from '@parshjs/files';
import { z } from 'zod';
import { commandTree } from './commandTree.gen.ts';

const cli = createCli({
  programName: 'mycli',
  tree: commandTree,
  context: {
    files: createFilesContext({
      basePath: join(osHomeConfigDir(), 'mycli'),
      files: {
        credentials: {
          filename: 'credentials.json',
          schema: z.object({ accessKey: z.string().min(1), secretKey: z.string().min(1) }),
        },
        prefs: {
          filename: 'prefs.json',
          schema: z.object({ region: z.string(), color: z.boolean() }),
          defaults: { region: 'us-east-1', color: true },
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

`osHomeConfigDir()` resolves per-OS (`~/.config/<x>`, `~/Library/Application Support/<x>`, `%APPDATA%\<x>`). `osHomeDir()` is `~`.

## Patterns

### Defaults — drop the `?? DEFAULTS` boilerplate

Declaring `defaults` on a spec makes `read()` return them when the file is missing (instead of throwing). Defaults live in memory only — nothing is written until an explicit write. Type-checked against the schema's inferred output.

### Gate a subcommand on a file existing

`ensureExists()` in `beforeHandler` produces a friendly user-facing error and lets the handler use `read()` (not `maybeRead()`).

```ts
defineCommand('s3 buckets list', {
  options: {},
  beforeHandler: async ({ files }) => {
    await files.credentials.ensureExists({ message: 'Run `mycli configure` first.' });
  },
  handler: async ({ files }) => {
    const creds = await files.credentials.read();
    /* … */
  },
});
```

### Sync access with `load()`

For call sites that need synchronous field access (constructing a client at startup, reads inside a TUI loop), `await load()` to get a stateful handle with a sync `.value`. `load()` is idempotent — call it from any number of `beforeHandler`s, disk is read once.

```ts
defineCommand('serve', {
  options: {},
  beforeHandler: async ({ files }) => {
    await files.prefs.load();
  },
  handler: async ({ files }) => {
    const prefs = await files.prefs.load();
    const client = createApiClient(prefs.value.region);   // sync
    await prefs.set({ region: 'eu-west-2' });             // partial write, updates .value
  },
});
```

`set()` and `replace()` keep `.value` in sync with disk. `reload()` is only for the case where something *outside* this handle modified the file (another process, a hand-edit). Single-process ownership is assumed.

## Common mistakes

- **Forgetting the `Register` augmentation.** Without it, `ctx.context.files` has no type. See the [parsh skill](../parsh/SKILL.md#shared-context).
- **`read()` without `defaults` or `ensureExists()`.** It throws on missing. Either declare `defaults` on the spec, gate via `ensureExists()` in `beforeHandler`, or use `maybeRead()` and handle `null`.
- **Hand-rolling JSON next to `@parshjs/files`.** Use the typed handle so writes are atomic and schema-checked.
- **Calling `load()` again to refresh.** It's idempotent — returns the cached handle. Use `reload()` on the loaded handle to re-read from disk.
