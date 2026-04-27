import { join } from 'node:path';
import {
  assertBuildSuccess,
  cleanDir,
  printBuildOutput,
  setPackageJsonDependencies,
} from '@repo/pack-utils';

const CURRENT_DIR = import.meta.dir;

const PKG_DIR = join(CURRENT_DIR, 'pkg');
const DIST_DIR = join(PKG_DIR, 'dist');

const PACKAGE_ENTRYPOINTS = ['./src/index.ts'];

console.log('🧹 Cleaning dist directory...');
await cleanDir({ dir: DIST_DIR });

console.log('🔨 Building @parshjs/env...');
const buildResult = await Bun.build({
  entrypoints: PACKAGE_ENTRYPOINTS,
  outdir: DIST_DIR,
  target: 'node',
});
assertBuildSuccess({ buildResult });
printBuildOutput({ buildResult });

console.log('🔄 Updating package.json...');
const internalPackageJsonPath = join(CURRENT_DIR, 'package.json');
const publicPackageJsonPath = join(PKG_DIR, 'package.json');
await setPackageJsonDependencies({
  sourcePackageJsonPath: internalPackageJsonPath,
  targetPackageJsonPath: publicPackageJsonPath,
});

console.log('✅ Done');
