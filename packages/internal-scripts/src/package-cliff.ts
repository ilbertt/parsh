import { join } from 'node:path';
import { type Options, runGitCliff } from 'git-cliff';
import type { ReleasePackage } from '#release-package.ts';

type PackageCliffOptions = Omit<
  Options,
  'config' | 'includePath' | 'tagPattern' | 'repository' | 'workdir'
>;

export async function readPackageCliff({
  releasePackage,
  options,
}: {
  releasePackage: ReleasePackage;
  options: PackageCliffOptions;
}): Promise<string> {
  const { stdout } = await runGitCliff(
    {
      ...options,
      config: join(import.meta.dir, '../cliff.toml'),
      includePath: `${releasePackage.directory}/**`,
      tagPattern: `^${releasePackage.tagPrefix}(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$`,
      useBranchTags: true,
    },
    { cwd: releasePackage.repoRoot, stdio: ['ignore', 'pipe', 'inherit'] },
  );
  return String(stdout);
}

export async function assertUnreleasedChanges(releasePackage: ReleasePackage) {
  const context: unknown = JSON.parse(
    await readPackageCliff({ releasePackage, options: { unreleased: true, context: true } }),
  );
  const hasChanges =
    Array.isArray(context) &&
    context.some(
      (release: unknown) =>
        release &&
        typeof release === 'object' &&
        'commits' in release &&
        Array.isArray(release.commits) &&
        release.commits.length > 0,
    );
  if (!hasChanges) {
    throw new Error(`Nothing to release: no new commits under ${releasePackage.directory}.`);
  }
}
