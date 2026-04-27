import { join } from 'node:path';
import { assertBuildSuccess, printBuildOutput } from '#build.ts';
import { cleanDir } from '#files.ts';
import { type GenericPackageJson, setPackageJsonDependencies } from '#package-json.ts';

type Layout = {
  packageDir: string;
  distDir: string;
  srcDir: string;
  internalPackageJsonPath: string;
  publicPackageJsonPath: string;
};

export async function buildPublicPackage({ packageDir }: { packageDir: string }) {
  const layout = resolveLayout({ packageDir });
  const internalPackageJson: GenericPackageJson = await Bun.file(
    layout.internalPackageJsonPath,
  ).json();
  const publicPackageJson: GenericPackageJson = await Bun.file(layout.publicPackageJsonPath).json();

  console.log('🧹 Cleaning dist directory...');
  await cleanDir({ dir: layout.distDir });

  console.log(`🔨 Building ${publicPackageJson.name}...`);
  await bundle({ layout, externals: Object.keys(internalPackageJson.dependencies ?? {}) });

  console.log('📝 Emitting type declarations...');
  await Bun.$`tsc -p ${join(layout.packageDir, 'tsconfig.build.json')}`;

  console.log('🔄 Updating package.json...');
  await setPackageJsonDependencies({
    sourcePackageJsonPath: layout.internalPackageJsonPath,
    targetPackageJsonPath: layout.publicPackageJsonPath,
  });

  console.log('✅ Done');
}

function resolveLayout({ packageDir }: { packageDir: string }): Layout {
  const pkgDir = join(packageDir, 'pkg');
  return {
    packageDir,
    distDir: join(pkgDir, 'dist'),
    srcDir: join(packageDir, 'src'),
    internalPackageJsonPath: join(packageDir, 'package.json'),
    publicPackageJsonPath: join(pkgDir, 'package.json'),
  };
}

async function bundle({ layout, externals }: { layout: Layout; externals: string[] }) {
  const entrypoints = await Array.fromAsync(
    new Bun.Glob('src/**/*.ts').scan({ absolute: true, cwd: layout.packageDir }),
  );
  const buildResult = await Bun.build({
    entrypoints,
    outdir: layout.distDir,
    root: layout.srcDir,
    splitting: true,
    sourcemap: 'linked',
    target: 'node',
    external: externals,
  });
  assertBuildSuccess({ buildResult });
  printBuildOutput({ buildResult });
}
