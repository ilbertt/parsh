# @parshjs/codegen

[![npm version](https://img.shields.io/npm/v/@parshjs/codegen.svg)](https://www.npmjs.com/package/@parshjs/codegen)
[![license](https://img.shields.io/npm/l/@parshjs/codegen.svg)](https://www.npmjs.com/package/@parshjs/codegen)

Filesystem-driven command tree generator for [`@parshjs/core`](https://www.npmjs.com/package/@parshjs/core).

Walks a `commands/` directory, validates each `defineCommand`, and emits a `commandTree.gen.ts` file that wires the runtime command tree and full `ctx` typing into `@parshjs/core`.

This file is **generated** — never hand-edit it. Commit it and re-run after any change under `commands/`.

## Install

```sh
npm install -D @parshjs/codegen
```

## Usage

```sh
parsh-codegen generate                   # one-shot
parsh-codegen generate --help            # full flag reference
```

## Convention

- One file per command. Export `command` from each.
- The directory layout mirrors the path string passed to `defineCommand`. `[name]` directories or files declare params.
- `_root.ts` is the optional root command (`defineRootCommand`).

```
src/commands/
  _root.ts                      // ''
  s3.ts                         // 's3'
  s3/
    buckets/
      list.ts                   // 's3 buckets list'
      [name].ts                 // 's3 buckets [name]'
      [name]/
        create.ts               // 's3 buckets [name] create'
```
