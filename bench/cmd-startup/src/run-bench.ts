#!/usr/bin/env bun
import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { generateCommandTree } from '../../../packages/codegen/src/generate.ts';

const HERE = import.meta.dir;
const COMMANDS_DIR = join(HERE, 'commands');
const LAZY_GEN = join(HERE, 'commandTree.lazy.gen.ts');
const EAGER_GEN = join(HERE, 'commandTree.eager.gen.ts');
const LAZY_BIN = join(HERE, 'bin-lazy.ts');
const EAGER_BIN = join(HERE, 'bin-eager.ts');

const ITERATIONS = 30;

interface ScenarioResult {
  label: string;
  args: string[];
  eagerMs: number[];
  lazyMs: number[];
}

function timeOnce({ bin, args }: { bin: string; args: string[] }): number {
  const start = Bun.nanoseconds();
  const r = spawnSync('bun', [bin, ...args], { stdio: ['ignore', 'ignore', 'ignore'] });
  const elapsed = (Bun.nanoseconds() - start) / 1_000_000;
  if (r.status !== 0 && r.status !== 2) {
    throw new Error(`bench failed: bun ${bin} ${args.join(' ')} → exit ${r.status}`);
  }
  return elapsed;
}

function bench({ bin, args, iters }: { bin: string; args: string[]; iters: number }): number[] {
  // Warm-up: discard first run (caches, JIT).
  timeOnce({ bin, args });
  const out: number[] = [];
  for (let i = 0; i < iters; i++) {
    out.push(timeOnce({ bin, args }));
  }
  return out;
}

function median(xs: number[]): number {
  // biome-ignore lint/complexity/useMaxParams: Array.sort comparator is inherently (a, b)
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!;
}

function p95(xs: number[]): number {
  // biome-ignore lint/complexity/useMaxParams: Array.sort comparator is inherently (a, b)
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length * 0.95)]!;
}

function fmt(ms: number): string {
  return `${ms.toFixed(1)}ms`;
}

console.log('Generating eager tree…');
await generateCommandTree({
  commandsDir: COMMANDS_DIR,
  outFile: EAGER_GEN,
  coreModule: '@repo/core',
  eager: true,
});

console.log('Generating lazy tree…');
await generateCommandTree({
  commandsDir: COMMANDS_DIR,
  outFile: LAZY_GEN,
  coreModule: '@repo/core',
  eager: false,
});

const scenarios: ReadonlyArray<{ label: string; args: string[] }> = [
  { label: '`bench --help` (root help)', args: ['--help'] },
  { label: '`bench bogus` (unknown cmd)', args: ['bogus'] },
  { label: '`bench a one` (dispatch leaf)', args: ['a', 'one'] },
  { label: '`bench d xyz get` (dispatch dynamic)', args: ['d', 'xyz', 'get'] },
];

const results: ScenarioResult[] = [];
for (const s of scenarios) {
  console.log(`Bench: ${s.label}`);
  const eagerMs = bench({ bin: EAGER_BIN, args: s.args, iters: ITERATIONS });
  const lazyMs = bench({ bin: LAZY_BIN, args: s.args, iters: ITERATIONS });
  results.push({ label: s.label, args: s.args, eagerMs, lazyMs });
}

const lines: string[] = [];
lines.push('# Lazy command-load benchmark');
lines.push('');
lines.push(
  '30 command files + `_root.ts`. Each row times `bun bin.ts <args>` end-to-end (cold process), median of 30 runs after a warm-up. **Eager** mode emits a static `import` for every command file at gen-file evaluation; **lazy** mode emits dynamic `import()` thunks dispatched on demand.',
);
lines.push('');
lines.push(`Bun ${Bun.version} on ${process.platform}/${process.arch}.`);
lines.push('');
lines.push('| Scenario | Eager (median / p95) | Lazy (median / p95) | Speedup (median) |');
lines.push('|---|---|---|---|');
for (const r of results) {
  const eMed = median(r.eagerMs);
  const lMed = median(r.lazyMs);
  const eP95 = p95(r.eagerMs);
  const lP95 = p95(r.lazyMs);
  const ratio = (eMed / lMed).toFixed(2);
  lines.push(
    `| ${r.label} | ${fmt(eMed)} / ${fmt(eP95)} | ${fmt(lMed)} / ${fmt(lP95)} | ${ratio}× |`,
  );
}
lines.push('');
lines.push('## Interpretation');
lines.push('');
lines.push(
  '- **Help and unknown-command paths** never load handler modules → constant work regardless of tree size. Eager pays for all 30 files; lazy pays for none.',
);
lines.push(
  '- **Dispatch** loads the chain (root + ancestors + target) — typically 2–4 files. With a small chain, lazy ≈ eager because the dispatched chain has to load anyway. The win grows when the eager mode would have loaded many *unused* files.',
);
lines.push(
  '- The absolute deltas are bounded by Bun’s ~20ms startup floor. Larger trees and per-command imports (zod schemas, helpers, etc.) widen the lazy/eager gap proportionally.',
);
lines.push('');
lines.push('## Reproduce');
lines.push('');
lines.push('```sh');
lines.push('bun bench/cmd-startup/src/gen-fixture.ts   # writes src/commands/');
lines.push('bun bench/cmd-startup/src/run-bench.ts     # regenerates gen files + benches');
lines.push('```');
lines.push('');

const benchmarksPath = join(HERE, '..', '..', '..', 'BENCHMARKS.md');
await writeFile(benchmarksPath, lines.join('\n'), 'utf8');
console.log(`\nWrote ${benchmarksPath}`);
console.log(lines.slice(7).join('\n'));
