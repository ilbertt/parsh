import pkg from './package.json' with { type: 'json' };

const result = await Bun.build({
  entrypoints: ['./src/main.ts'],
  outdir: './dist',
  target: 'bun',
  external: ['react-devtools-core'],
  // ink lazily imports its devtools module; without splitting Bun inlines it and hoists
  // the optional `react-devtools-core` import to the top level, breaking every run.
  splitting: true,
  define: { __VERSION__: JSON.stringify(pkg.version) },
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}
