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
