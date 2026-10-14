import { requiredEnv } from '#env.ts';
import { readPackageCliff } from '#package-cliff.ts';
import { validateReleaseTag } from '#release-tag.ts';

const releasePackage = await validateReleaseTag({ tag: requiredEnv('GITHUB_REF_NAME') });
const notes = await readPackageCliff({
  releasePackage,
  options: { current: true, strip: 'header' },
});
// Bun's workspace runner prefixes stdout, so release notes are passed to gh through a file.
await Bun.write(requiredEnv('RELEASE_NOTES_FILE'), notes);
