import { requiredEnv } from '#env.ts';
import { writeGithubOutputs } from '#github-outputs.ts';
import { preparePackageRelease } from '#prepare-package-release.ts';
import { releasePrBody } from '#release-pr-body.ts';

const release = await preparePackageRelease({
  packageName: requiredEnv('PACKAGE'),
  bump: requiredEnv('BUMP'),
});
await Bun.write(requiredEnv('RELEASE_PR_BODY_FILE'), releasePrBody(release));
await writeGithubOutputs({
  package_dir: release.publishDirectory,
  changelog: `${release.directory}/CHANGELOG.md`,
  version: release.version,
  tag: release.tag,
});
console.log(`Prepared ${release.tag}`);
