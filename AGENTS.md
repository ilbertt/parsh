## Project

`parsh` — a type-safe router for TypeScript CLIs. Bun + TypeScript monorepo (`packages/*`).

## Non-negotiables

1. **No `any` in public API types.** `unknown` where necessary. If tempted to reach for `any`, stop and ask.
2. **Schema-agnostic via Standard Schema v1.** `@parshjs/core` depends on the `~standard` interface only. Zod is allowed in tests and fixtures, never as a dependency of core.
3. **Object-config API.** `defineCommand('path', {...})` with an explicit path string. No fluent chain.
4. **Headless core.** No Ink, chalk, ora, or terminal-rendering deps in `@parshjs/core` or `@parshjs/codegen`.
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
- Imports inside a published package's `src/` (anything with a `pkg/` directory) use relative paths with `.js` extensions (e.g. `import { foo } from './services/foo.js'`). Reason: `tsc` preserves the literal specifier in emitted `.d.ts`, so `.js` is what consumers need.
- Internal/test code and unpublished packages use `#*` subpath mapping (e.g. `import { foo } from '#services/foo'`) configured via the package's `imports` field. These never go through declaration emit.
- Single source of truth — never duplicate keys, enum values, or type info that belongs to a class/module; derive from the source instead
- Biome enforces `useMaxParams: 1` — wrap multiple params in an object
- Only re-export from index files - Biome enforces that

## Validation

After finishing an implementation, always run:

1. `bun fix:codestyle` — auto-fix formatting/lint issues
2. `bun check:all` — verify types and codestyle pass
3. `bun run test` - verify that the code is working properly, including safety of the types exposed by the packages
3. `bun run build` — verify the build succeeds

## Run scripts

When running a script, always check `package.json` scripts (root and per-app) for available commands first.

## READMEs

Packages fall in two buckets:

- **Published packages** (have a `pkg/` directory) carry **two** READMEs:
  - **`packages/<package>/pkg/README.md`** — public, user-facing. Ships to npm as part of `@parshjs/<package>` (listed under `"files"` in `pkg/package.json`). This is what users see on the npm page. Covers install, usage, and public API. Must use the published name (`@parshjs/...`), not the workspace name (`@repo/...`).
  - **`packages/<package>/README.md`** — internal contributor doc. Covers source layout, dev scripts, and constraints. **Must link to `pkg/README.md`** and **must not duplicate install/usage** — when in doubt, the public README wins and the internal one points to it.
- **Internal-only packages** (no `pkg/`) may not need a README at all. Add one only when there's contributor-relevant context that isn't obvious from the source.

When editing a published package, decide which audience the change is for and update only that file. If something belongs to both (e.g. a renamed export), update them in lockstep.

The root `README.md` is the project homepage: typically lists the public packages/apps and a quick-start. Keep it short — deep usage lives in each `pkg/README.md`.

## Agent skills

Each published package has a corresponding agent skill under [`skills/`](./skills/). These are how AI coding agents learn to use parsh — they are part of the public surface of the project, just like the npm READMEs, and must stay in sync with the code.

**Whenever you change a package's public API, behavior, defaults, or recommended usage, update its skill in the same change.** That includes:

- Adding / removing / renaming an export, option, flag, or method.
- Changing a default value, a coercion rule, or a thrown error type.
- Adding a new published package — create a `skills/parsh-<packageName>/SKILL.md` for it and register it in this table.
- Anything that would make a code example in a skill stop working or stop reflecting best practice.

Treat skills as documentation that *must compile*. If an example in a skill no longer matches the code, that's a bug at the same severity as a stale README. The PR that lands the code change should land the skill update too.

Package-specific behavior goes in that package's skill (`parsh-env`, `parsh-files`, …); cross-cutting workflow (paths, codegen, `Register`, lifecycle) goes in [`skills/parsh/`](./skills/parsh/).

## Keeping this file up to date

When a change affects code style, tooling, conventions, or project taste (new lint rules, formatter config, naming patterns, dependency choices, etc.), propose updating this file to reflect it.
