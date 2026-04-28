# with-node

Minimal `parsh` CLI compiled with `tsc` and run on Node — no Bun on the build or run path.

The other examples use `Bun.build` to bundle and `bun` to run. This one shows that `@parshjs/core` works under Node with a plain TypeScript toolchain.

## Install

This example lives inside a Bun-managed monorepo (`workspace:` and `catalog:` protocols), so install at the repo root with `bun install`. In a standalone Node project you'd use `npm install` against ordinary semver ranges.

## What's different

- **Build:** `tsc -p tsconfig.build.json` emits ESM `.js` into `./dist`. No bundler.
- **Run:** `node dist/main.js`.
- **`rewriteRelativeImportExtensions: true`** in `tsconfig.build.json`. The codegen output and source files import siblings with `.ts` extensions; this option (TS 5.7+) rewrites them to `.js` on emit so Node's ESM resolver can follow them at runtime.

## Node version

Pinned via `.node-version`. With [`fnm`](https://github.com/Schniz/fnm) installed, run `fnm use` from this folder before the scripts below to activate the pinned version (or set up `--use-on-cd` so it switches automatically on `cd`). `nodenv` and Volta also read `.node-version`.

## Scripts

- `npm run generate` — regenerate `src/commandTree.gen.ts` after adding or renaming command files.
- `npm run build` — type-check and emit to `./dist`.
- `npm run start` — build then run with `node`.
- `npm run check:types` — type-check without emitting.

## Try it

```bash
npm run start -- greet
npm run start -- greet --loud
npm run start -- greet world
```
