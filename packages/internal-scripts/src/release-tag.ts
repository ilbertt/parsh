import { $ } from 'bun';
import { repoRoot as defaultRepoRoot } from '#paths.ts';
import { assertStableVersion, readReleasePackage } from '#release-package.ts';

export async function validateReleaseTag({
  tag,
  repoRoot = defaultRepoRoot,
}: {
  tag: string;
  repoRoot?: string;
}) {
  const match = /^([a-z][a-z0-9-]*)-v(.+)$/.exec(tag);
  if (!match) {
    throw new Error(`Expected a tag like core-v0.0.11: ${tag}`);
  }
  const [, packageName, version] = match;
  assertStableVersion(version!);
  const releasePackage = await readReleasePackage({ packageName: packageName!, repoRoot });
  const expected = `${releasePackage.tagPrefix}${releasePackage.version}`;
  if (tag !== expected) {
    throw new Error(`Tag ${tag} does not match the package version (expected ${expected}).`);
  }
  await $`git merge-base --is-ancestor HEAD origin/main`.cwd(releasePackage.repoRoot).quiet();
  const taggedCommit = await $`git rev-parse ${`${tag}^{commit}`}`
    .cwd(releasePackage.repoRoot)
    .text();
  const head = await $`git rev-parse HEAD`.cwd(releasePackage.repoRoot).text();
  if (taggedCommit.trim() !== head.trim()) {
    throw new Error(`Tag ${tag} does not point to the checked-out commit.`);
  }
  return releasePackage;
}
