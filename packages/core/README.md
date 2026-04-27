# @repo/core

> **Note:** This is the internal development package. The README that gets published to npm lives in [`pkg/README.md`](./pkg/README.md) — that is the one users of `@parshjs/core` will see.

Type-safe router for TypeScript CLIs. Filesystem-driven command tree, Standard Schema v1 for validation, fully typed `ctx` (options, params, parents, root, shared context) with no generics at call sites.

The internal workspace package (`@repo/core`) builds into [`pkg/`](./pkg/), which is the directory published to npm as `@parshjs/core`.

## Publishing

The [`pkg/`](./pkg/) directory is the publish root. The commands to build and publish are:

```sh
bun run build
cd pkg && bun publish
```
