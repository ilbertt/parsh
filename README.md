# bun-monorepo-starter

A monorepo template powered by [Bun](https://bun.sh) and [Turborepo](https://turborepo.dev/).

## Structure

```
apps/
  my-app/          # Bun application (template)
packages/
  my-package/      # Publishable npm package (template)
  pack-utils/      # Internal build utilities for packages
  typescript-config/  # Shared TypeScript configuration
```

## Using this template

After creating a repo from this template, go through the following checklist:

- [ ] **`LICENSE`** — replace `[year]` and `[fullname]` with the current year and your name / org.
- [ ] **`package.json`** (root) — rename `"name": "bun-monorepo"` to your project name.
- [ ] **`.github/CONTRIBUTING.md`** — replace `<repository-name>` and `<repository-url>` with your actual repo details.
- [ ] **`apps/my-app/`** — rename the folder and update `"name"` in its `package.json`.
- [ ] **`packages/my-package/`** — rename the folder and update `"name"` in its internal `package.json` accordingly.
- [ ] **`packages/my-package/pkg/package.json`** — this is the public-facing package manifest. Update `"name"`, `"description"`, `"author"`, `"version"`, and the `"repository"` URL.
- [ ] Delete or adapt the example source files in `apps/my-app/src/` and `packages/my-package/src/`.

## Requirements

- [Bun](https://bun.sh)

## Getting started

```sh
bun install
bun run build
```

## Tooling

- [Bun](https://bun.sh) — runtime, package manager, bundler
- [Turborepo](https://turborepo.dev/) — task orchestration with caching
- [Biome](https://biomejs.dev/) — linter and formatter
- [commitlint](https://commitlint.js.org/) — conventional commit enforcement
- [TypeScript](https://www.typescriptlang.org/) — shared config via `@repo/typescript-config`
