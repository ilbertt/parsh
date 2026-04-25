# Lazy command-load benchmark

30 command files + `_root.ts`. Each row times `bun bin.ts <args>` end-to-end (cold process), median of 30 runs after a warm-up. **Eager** mode emits a static `import` for every command file at gen-file evaluation; **lazy** mode emits dynamic `import()` thunks dispatched on demand.

Bun 1.3.13 on darwin/arm64.

| Scenario | Eager (median / p95) | Lazy (median / p95) | Speedup (median) |
|---|---|---|---|
| `bench --help` (root help) | 23.2ms / 24.5ms | 12.7ms / 13.8ms | 1.82× |
| `bench bogus` (unknown cmd) | 21.9ms / 22.6ms | 12.4ms / 13.3ms | 1.77× |
| `bench a one` (dispatch leaf) | 23.8ms / 24.8ms | 22.8ms / 23.4ms | 1.04× |
| `bench d xyz get` (dispatch dynamic) | 23.2ms / 24.2ms | 23.4ms / 25.0ms | 0.99× |

## Interpretation

- **Help and unknown-command paths** never load handler modules → constant work regardless of tree size. Eager pays for all 30 files; lazy pays for none.
- **Dispatch** loads the chain (root + ancestors + target) — typically 2–4 files. With a small chain, lazy ≈ eager because the dispatched chain has to load anyway. The win grows when the eager mode would have loaded many *unused* files.
- The absolute deltas are bounded by Bun’s ~20ms startup floor. Larger trees and per-command imports (zod schemas, helpers, etc.) widen the lazy/eager gap proportionally.

## Reproduce

```sh
bun bench/cmd-startup/src/gen-fixture.ts   # writes src/commands/
bun bench/cmd-startup/src/run-bench.ts     # regenerates gen files + benches
```
