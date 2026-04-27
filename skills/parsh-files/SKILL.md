---
name: parsh-files
description: How to use @parshjs/files for typed JSON file storage in a parsh CLI. Use when adding persistent config or state to a CLI (credentials, user prefs, cached state) — anything written as JSON on disk. Pairs with the parsh skill — read that first if you don't know how parsh CLIs are structured.
---

# parsh-files

[`@parshjs/files`](https://www.npmjs.com/package/@parshjs/files) gives a parsh CLI a typed `ctx.context.files` for persistent JSON storage. Each file is declared with a [Standard Schema v1](https://standardschema.dev) schema (Zod, Valibot, ArkType, …); reads and writes are validated and atomic (write-via-rename, never half-written JSON on disk).

For the broader parsh workflow (commands, codegen, `Register`), see [`../parsh/SKILL.md`](../parsh/SKILL.md).

## When to use

- Persistent CLI config (the equivalent of `~/.config/mycli/config.json`).
- Cached credentials, tokens, or other small JSON state the CLI needs across runs.
- Project-local state files (e.g. `.mycli/state.json` in the cwd).

**Do not use** for large data, binary blobs, or anything performance-critical — it's `JSON.parse` / `JSON.stringify` plus an atomic rename.

## Install

```sh
bun add @parshjs/files
```

## Setup

Inject `createFilesContext` into `createCli`'s `context`, and register the `Cli` so the types propagate.

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
          schema: z.object({ region: z.string(), color: z.boolean().default(true) }),
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

`osHomeConfigDir()` resolves to the platform-appropriate config dir (`~/.config/<x>` on Linux, `~/Library/Application Support/<x>` on macOS, `%APPDATA%\<x>` on Windows). `osHomeDir()` is `~`.

## Reading and writing in a handler

Each file gets a typed handle with `read()`, `maybeRead()`, `write()`, and `ensureExists()`. Registered context lives under `ctx.context`, so the file handles read as `ctx.context.files.<key>`:

```ts
defineCommand('login', {
  options: {},
  handler: async ({ context, print }) => {
    const existing = await context.files.credentials.maybeRead();   // T | null
    await context.files.credentials.write({ accessKey: 'AKIA…', secretKey: '…' });
    context.files.credentials.write({ foo: 'bar' });                // ❌ compile-time error
    context.files.unknown;                                          // ❌ compile-time error
    print.success('logged in');
  },
});
```

| Method | Returns | Use it for |
| --- | --- | --- |
| `read()` | `Promise<T>` | Reading after you've already proven the file exists (e.g. via `ensureExists()` in `beforeHandler`). Throws `FileNotFoundError` if missing. |
| `maybeRead()` | `Promise<T \| null>` | Reading when the file might not exist. Returns `null` instead of throwing on missing. |
| `write(value)` | `Promise<void>` | Atomic write. Validates `value` against the schema; throws `FileValidationError` on bad shape. |
| `ensureExists({ message? })` | `Promise<void>` | Throws `FileNotFoundError` (with an optional friendly message) if the file is missing. |

## Pattern: gate a subcommand on a file existing

Use `ensureExists()` in `beforeHandler` so `read()` can return `T` (not `T | null`) and the user gets a friendly message before the handler runs.

```ts
defineCommand('s3 buckets list', {
  options: {},
  beforeHandler: async ({ files }) => {
    await files.credentials.ensureExists({
      message: 'Run `mycli configure` first.',
    });
  },
  handler: async ({ files }) => {
    const creds = await files.credentials.read();   // T (not T | null)
    /* … */
  },
});
```

If the file is missing, the user sees the `message` directly and the handler never runs. See lifecycle hooks in [`../parsh/references/context-and-state.md`](../parsh/references/context-and-state.md).

## Pattern: write-then-confirm

```ts
defineCommand('configure', {
  options: {
    accessKey: { schema: z.string(), required: true },
    secretKey: { schema: z.string(), required: true },
  },
  handler: async ({ files, options }) => {
    await files.credentials.write({
      accessKey: options.accessKey,
      secretKey: options.secretKey,
    });
    console.log('Saved.');
  },
});
```

## Errors

- `FileNotFoundError` — `read()` or `ensureExists()` on a missing file.
- `FileValidationError` — file contents (or a `write()` value) don't match the schema, or the JSON is malformed.

These are **developer signals**. Surface them to the user via a friendly `message` on `ensureExists()`, or catch them in a handler and log something nicer.

## Common mistakes

- **Forgetting the `Register` augmentation.** Without it, `ctx.files` is invisible. See the [parsh skill](../parsh/SKILL.md#shared-context).
- **Using `read()` without `ensureExists()`.** `read()` throws on missing — call it from a handler that's already gated by `ensureExists()` in `beforeHandler`, or use `maybeRead()` and handle `null`.
- **Hand-rolling JSON read/write next to `@parshjs/files`.** Use the typed handle so writes are atomic and schema-checked.
- **Storing large or binary data.** This package is for small JSON state.
