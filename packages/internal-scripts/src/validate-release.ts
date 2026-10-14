import { requiredEnv } from '#env.ts';
import { writeGithubOutputs } from '#github-outputs.ts';
import { validateReleaseTag } from '#release-tag.ts';

const releasePackage = await validateReleaseTag({ tag: requiredEnv('GITHUB_REF_NAME') });
await writeGithubOutputs({ package_dir: releasePackage.publishDirectory });
