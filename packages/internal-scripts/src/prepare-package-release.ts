import { $ } from 'bun';
import { nextPackageVersion } from '#next-package-version.ts';
import { readPackageCliff } from '#package-cliff.ts';
import { repoRoot as defaultRepoRoot } from '#paths.ts';
import { readReleasePackage } from '#release-package.ts';

export async function preparePackageRelease({
  packageName,
  repoRoot = defaultRepoRoot,
}: {
  packageName: string;
  repoRoot?: string;
}) {
  const releasePackage = await readReleasePackage({ packageName, repoRoot });
  const version = await nextPackageVersion(releasePackage);
  const tag = `${releasePackage.tagPrefix}${version}`;
  const changelog = await readPackageCliff({ releasePackage, options: { tag } });
  await Bun.write(
    releasePackage.manifestPath,
    `${JSON.stringify({ ...releasePackage.manifest, version }, null, 2)}\n`,
  );
  const updated = await readReleasePackage({ packageName, repoRoot: releasePackage.repoRoot });
  await Bun.write(updated.changelogPath, changelog);
  await $`bun install --lockfile-only`.cwd(updated.repoRoot).quiet();
  return { ...updated, tag };
}
