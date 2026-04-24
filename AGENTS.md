## Project

`parsh` — a type-safe router for TypeScript CLIs. Bun + TypeScript monorepo (`packages/*`).

## Non-negotiables

1. **No `any` in public API types.** `unknown` where necessary. If tempted to reach for `any`, stop and ask.
2. **Schema-agnostic via Standard Schema v1.** `@parsh/core` depends on the `~standard` interface only. Zod is allowed in tests and fixtures, never as a dependency of core.
3. **Object-config API.** `defineCommand('path', {...})` with an explicit path string. No fluent chain.
4. **Headless core.** No Ink, chalk, ora, or terminal-rendering deps in `@parsh/core` or `@parsh/codegen`.
5. **Filesystem is the source of truth.** Users declare commands by creating files. They never maintain a hand-written mirror of the command tree.
6. **End-to-end inference is the product.** Handler `ctx` is typed via `CommandRegistry[Path]` lookup, populated by the generated file. Zero user-written generics at call sites. If inference breaks, that's a P0 bug.
7. **Generator verbosity beats clever types.** Precompute intersections in the generated `declare module` block. Do not compute them via recursive conditional types at use sites. The spike proved this keeps compile times flat even at depth.
8. **String is source of truth for params.** The path string declares which params exist; the `params` object declares their schemas. TypeScript enforces agreement (wrong key, missing key, or extra key are compile errors). Children inherit params without redeclaring.

## Stack

- **Runtime:** Bun
- **Tests:** Bun test framework
- **Monorepo:** Bun workspaces + Turbo
- **Linter/Formatter:** Biome (auto-formats on save)
- **Commits:** Conventional Commits (commitlint)

## Code style

- No comments that restate what types and naming already say — only comment the non-obvious
- No comments to highlight code sections - split the files if it's too big or contains unrelated code
- Imports use `#*` subpath mapping (e.g. `import { foo } from '#services/foo'`)
- Single source of truth — never duplicate keys, enum values, or type info that belongs to a class/module; derive from the source instead
- Biome enforces `useMaxParams: 1` — wrap multiple params in an object

## Validation

After finishing an implementation, always run:

1. `bun fix:codestyle` — auto-fix formatting/lint issues
2. `bun check:all` — verify types and codestyle pass
3. `bun run test` - verify that the code is working properly, including safety of the types exposed by the packages
3. `bun run build` — verify the build succeeds

## Run scripts

When running a script, always check `package.json` scripts (root and per-app) for available commands first.

## Keeping this file up to date

When a change affects code style, tooling, conventions, or project taste (new lint rules, formatter config, naming patterns, dependency choices, etc.), propose updating this file to reflect it.
