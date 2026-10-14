import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readPackageCliff } from '#package-cliff.ts';
import { assertStableVersion, type ReleasePackage } from '#release-package.ts';
import { readUnreleasedPackage } from '#unreleased-package.ts';

export async function nextPackageVersion(releasePackage: ReleasePackage) {
  const release = await readUnreleasedPackage(releasePackage);
  const { previous } = release;
  const baseline = `${releasePackage.tagPrefix}${releasePackage.version}`;
  if (previous && typeof previous === 'object' && 'version' in previous && previous.version) {
    if (previous.version !== baseline) {
      throw new Error(`Last release tag ${previous.version} does not match ${baseline}.`);
    }
  } else {
    // git-cliff otherwise uses its initial version without bumping the already-published manifest.
    release.previous = { ...release, version: baseline, commits: [], previous: null };
  }

  const directory = await mkdtemp(join(tmpdir(), 'parsh-cliff-context-'));
  try {
    const fromContext = join(directory, 'context.json');
    await Bun.write(fromContext, JSON.stringify([release]));
    const tag = (
      await readPackageCliff({
        releasePackage,
        options: { fromContext, bump: 'auto', bumpedVersion: true },
      })
    ).trim();
    if (!tag.startsWith(releasePackage.tagPrefix)) {
      throw new Error(`git-cliff returned an unexpected release tag: ${tag}`);
    }
    const version = tag.slice(releasePackage.tagPrefix.length);
    assertStableVersion(version);
    if (!Bun.semver.satisfies(version, `>${releasePackage.version}`)) {
      throw new Error(`git-cliff did not advance the package version: ${version}`);
    }
    return version;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
