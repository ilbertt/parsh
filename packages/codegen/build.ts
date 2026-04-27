import { join } from 'node:path';
import {
  assertBuildSuccess,
  cleanDir,
  printBuildOutput,
  setPackageJsonDependencies,
} from '@repo/pack-utils';
import pkg from './pkg/package.json' with { type: 'json' };

const CURRENT_DIR = import.meta.dir;
const PKG_DIR = join(CURRENT_DIR, 'pkg');
const DIST_DIR = join(PKG_DIR, 'dist');
const SRC_DIR = join(CURRENT_DIR, 'src');

console.log('🧹 Cleaning dist directory...');
await cleanDir({ dir: DIST_DIR });

console.log('🔨 Building @parshjs/codegen...');
const buildResult = await Bun.build({
  entrypoints: ['./src/cli/main.ts'],
  outdir: DIST_DIR,
  root: SRC_DIR,
  target: 'node',
  minify: true,
  define: { __VERSION__: JSON.stringify(pkg.version) },
  external: Object.keys(pkg.dependencies ?? {}),
});
assertBuildSuccess({ buildResult });
printBuildOutput({ buildResult });

console.log('🔄 Updating package.json...');
await setPackageJsonDependencies({
  sourcePackageJsonPath: join(CURRENT_DIR, 'package.json'),
  targetPackageJsonPath: join(PKG_DIR, 'package.json'),
});

console.log('✅ Done');
