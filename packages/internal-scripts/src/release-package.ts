import { join } from 'node:path';
import { repoRoot as defaultRepoRoot } from '#paths.ts';

const STABLE_VERSION = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;

export function assertStableVersion(version: string) {
  if (!STABLE_VERSION.test(version)) {
    throw new Error(`Expected a stable semver version: ${version}`);
  }
}

export async function readReleasePackage({
  packageName,
  repoRoot = defaultRepoRoot,
}: {
  packageName: string;
  repoRoot?: string;
}) {
  if (!/^[a-z][a-z0-9-]*$/.test(packageName)) {
    throw new Error(`Invalid package directory name: ${packageName}`);
  }
  const directory = `packages/${packageName}`;
  const publishDirectory = `${directory}/pkg`;
  const manifestPath = join(repoRoot, publishDirectory, 'package.json');
  const manifest: unknown = await Bun.file(manifestPath).json();
  if (
    !manifest ||
    typeof manifest !== 'object' ||
    !('name' in manifest) ||
    manifest.name !== `@parshjs/${packageName}` ||
    ('private' in manifest && manifest.private === true) ||
    !('version' in manifest) ||
    typeof manifest.version !== 'string'
  ) {
    throw new Error(`Not a public parsh package: ${packageName}`);
  }
  assertStableVersion(manifest.version);
  return {
    packageName,
    repoRoot,
    directory,
    publishDirectory,
    manifestPath,
    changelogPath: join(repoRoot, directory, 'CHANGELOG.md'),
    version: manifest.version,
    tagPrefix: `${packageName}-v`,
  };
}

export type ReleasePackage = Awaited<ReturnType<typeof readReleasePackage>>;
