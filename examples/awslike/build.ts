import pkg from './package.json' with { type: 'json' };

const result = await Bun.build({
  entrypoints: ['./src/main.ts'],
  outdir: './dist',
  target: 'bun',
  define: { __VERSION__: JSON.stringify(pkg.version) },
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}
