import { readPackageCliff } from '#package-cliff.ts';
import type { ReleasePackage } from '#release-package.ts';

export async function readUnreleasedPackage(releasePackage: ReleasePackage) {
  const context: unknown = JSON.parse(
    await readPackageCliff({ releasePackage, options: { unreleased: true, context: true } }),
  );
  const release: unknown = Array.isArray(context) ? context[0] : undefined;
  if (
    !release ||
    typeof release !== 'object' ||
    !('commits' in release) ||
    !Array.isArray(release.commits) ||
    release.commits.length === 0
  ) {
    throw new Error(`Nothing to release: no new commits under ${releasePackage.directory}.`);
  }
  return release as Record<string, unknown> & { commits: unknown[]; previous?: unknown };
}
