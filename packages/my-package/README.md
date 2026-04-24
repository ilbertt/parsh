# my-package

> **Note:** This is the internal development package. The README that gets published to npm lives in [`pkg/README.md`](./pkg/README.md) — that is the one users of your package will see.

A template publishable package inside the monorepo.

The internal workspace package (`@repo/my-package`) builds into [`pkg/`](./pkg/), which is the directory published to npm as `@my-org/my-package`.

## Development

```sh
# From the repo root
bun install
bun run build
```

## Publishing

The [`pkg/`](./pkg/) directory is the publish root. The commands to build and publish are:

```sh
bun run build
cd pkg && bun publish
```
