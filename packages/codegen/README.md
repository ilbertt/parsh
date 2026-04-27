# @repo/codegen

> **Note:** This is the internal development package. The README that gets published to npm lives in [`pkg/README.md`](./pkg/README.md) — that is the one users of `@parshjs/codegen` will see.

Filesystem-driven command tree generator for [`@parshjs/core`](../core). Walks a `commands/` directory, validates each `defineCommand`, and emits a `commandTree.gen.ts` that wires the runtime tree and the full `ctx` typing.

The internal workspace package (`@repo/codegen`) builds into [`pkg/`](./pkg/), which is the directory published to npm as `@parshjs/codegen`.

## Publishing

The [`pkg/`](./pkg/) directory is the publish root. The commands to build and publish are:

```sh
bun run build
cd pkg && bun publish
```
