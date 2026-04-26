# @repo/files

> **Note:** This is the internal development package. The README that gets published to npm lives in [`pkg/README.md`](./pkg/README.md) — that is the one users of `@parsh/files` will see.

Typed JSON file storage for [`@parsh/core`](../core) cli's `ctx`. Standard Schema v1, atomic writes, helpers for cross-platform config dirs.

The internal workspace package (`@repo/files`) builds into [`pkg/`](./pkg/), which is the directory published to npm as `@parsh/files`.

## Publishing

The [`pkg/`](./pkg/) directory is the publish root. The commands to build and publish are:

```sh
bun run build
cd pkg && bun publish
```
