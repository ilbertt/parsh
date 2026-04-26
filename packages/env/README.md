# @repo/env

> **Note:** This is the internal development package. The README that gets published to npm lives in [`pkg/README.md`](./pkg/README.md) — that is the one users of `@parsh/env` will see.

Typed, lazy environment-variable access for [`@parsh/core`](../core) cli's `ctx`. Standard Schema v1, with built-in numeric/boolean coercion mirroring how core parses options and params.

The internal workspace package (`@repo/env`) builds into [`pkg/`](./pkg/), which is the directory published to npm as `@parsh/env`.

## Publishing

The [`pkg/`](./pkg/) directory is the publish root. The commands to build and publish are:

```sh
bun run build
cd pkg && bun publish
```
