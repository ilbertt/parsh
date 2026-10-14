import { join } from 'node:path';
import { $ } from 'bun';
import { assertUnreleasedChanges, readPackageCliff } from '#package-cliff.ts';
import { repoRoot as defaultRepoRoot } from '#paths.ts';
import { readReleasePackage } from '#release-package.ts';

export async function preparePackageRelease({
  packageName,
  bump,
  repoRoot = defaultRepoRoot,
}: {
  packageName: string;
  bump: string;
  repoRoot?: string;
}) {
  if (!['patch', 'minor', 'major'].includes(bump)) {
    throw new Error(`Invalid version bump: ${bump}`);
  }
  const releasePackage = await readReleasePackage({ packageName, repoRoot });
  await assertUnreleasedChanges(releasePackage);

  await $`npm version ${bump} --no-git-tag-version --ignore-scripts --workspaces=false`
    .cwd(join(releasePackage.repoRoot, releasePackage.publishDirectory))
    .quiet();
  const updated = await readReleasePackage({ packageName, repoRoot: releasePackage.repoRoot });
  const tag = `${updated.tagPrefix}${updated.version}`;
  const changelog = await readPackageCliff({ releasePackage: updated, options: { tag } });
  await Bun.write(updated.changelogPath, changelog);
  await $`bun install --lockfile-only`.cwd(updated.repoRoot).quiet();
  return { ...updated, tag };
}
