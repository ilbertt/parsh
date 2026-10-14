import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { nextPackageVersion } from '#next-package-version.ts';
import { readPackageCliff } from '#package-cliff.ts';
import { preparePackageRelease } from '#prepare-package-release.ts';
import { readReleasePackage } from '#release-package.ts';
import { validateReleaseTag } from '#release-tag.ts';
import { readUnreleasedPackage } from '#unreleased-package.ts';

let repoRoot: string;
let commitTime: number;
const INITIAL_COMMIT_TIME = Date.parse('2026-01-01T00:00:00Z');
const COMMIT_INTERVAL = 1000;

async function git(args: string[]) {
  return await $`git ${args}`.cwd(repoRoot).quiet().text();
}

async function commit(message: string) {
  commitTime += COMMIT_INTERVAL;
  const date = new Date(commitTime).toISOString();
  await git(['add', '.']);
  await $`git commit --allow-empty -m ${message}`
    .cwd(repoRoot)
    .env({ ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date })
    .quiet();
}

beforeEach(async () => {
  repoRoot = await mkdtemp(join(tmpdir(), 'parsh-release-test-'));
  commitTime = INITIAL_COMMIT_TIME;
  await Bun.write(
    join(repoRoot, 'package.json'),
    JSON.stringify({ name: 'fixture', private: true, workspaces: ['packages/*/pkg'] }),
  );
  for (const [name, version] of [
    ['core', '0.0.10'],
    ['env', '0.0.3'],
  ]) {
    await Bun.write(
      join(repoRoot, `packages/${name}/pkg/package.json`),
      JSON.stringify({ name: `@parshjs/${name}`, version, type: 'module', dependencies: {} }),
    );
    await Bun.write(join(repoRoot, `packages/${name}/src/index.ts`), 'export {};\n');
  }
  await git(['init', '-b', 'main']);
  await git(['config', 'user.name', 'Test']);
  await git(['config', 'user.email', 'test@example.com']);
  await commit('feat: initial packages');
});

afterEach(async () => {
  await rm(repoRoot, { recursive: true, force: true });
});

describe('package-scoped release history', () => {
  test('renders consecutive commits as a compact Markdown list', async () => {
    await Bun.write(join(repoRoot, 'packages/core/src/index.ts'), 'export const first = true;\n');
    await commit('fix(core): repair first');
    const first = (await git(['rev-parse', '--short=7', 'HEAD'])).trim();
    await Bun.write(join(repoRoot, 'packages/core/src/index.ts'), 'export const second = true;\n');
    await commit('fix(core): repair second');
    const second = (await git(['rev-parse', '--short=7', 'HEAD'])).trim();
    const releasePackage = await readReleasePackage({ packageName: 'core', repoRoot });
    const changelog = await readPackageCliff({
      releasePackage,
      options: { tag: 'core-v0.1.0' },
    });

    expect(changelog).toContain(
      `### Fixes\n\n- Repair second (${second})\n- Repair first (${first})\n`,
    );
    expect(changelog).not.toContain('\n\n\n');
  });

  test('uses package paths and tags for both changelogs and release notes', async () => {
    await git(['tag', 'core-v0.0.10']);
    await Bun.write(join(repoRoot, 'packages/core/src/index.ts'), 'export const fixed = true;\n');
    await commit('fix(core): repair parsing');
    await Bun.write(join(repoRoot, 'packages/env/src/index.ts'), 'export const env = true;\n');
    await commit('feat(env)!: unrelated breaking change');
    await git(['tag', 'env-v9.0.0']);
    await Bun.write(join(repoRoot, 'examples/demo.ts'), 'export {};\n');
    await commit('feat(examples): unrelated example');
    await Bun.write(join(repoRoot, 'README.md'), '# Fixture\n');
    await commit('docs: unrelated homepage');

    const release = await preparePackageRelease({ packageName: 'core', repoRoot });
    expect(release.tag).toBe('core-v0.0.11');
    const changelog = await Bun.file(release.changelogPath).text();
    expect(changelog).toContain('core-v0.0.11');
    expect(changelog).toContain('Repair parsing');
    expect(changelog).toContain('core-v0.0.10');
    expect(changelog).not.toContain('unrelated');
    expect(await Bun.file(join(repoRoot, 'packages/env/CHANGELOG.md')).exists()).toBe(false);
    const sibling = await Bun.file(join(repoRoot, 'packages/env/pkg/package.json')).json();
    expect(sibling.version).toBe('0.0.3');
    const lockfile = await Bun.file(join(repoRoot, 'bun.lock')).text();
    expect(lockfile).toContain('"version": "0.0.11"');
    await $`bun install --frozen-lockfile`.cwd(repoRoot).quiet();

    await commit('chore(release): core-v0.0.11');
    await git(['tag', release.tag]);
    await git(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
    const validated = await validateReleaseTag({ tag: release.tag, repoRoot });
    const notes = await readPackageCliff({
      releasePackage: validated,
      options: { current: true, strip: 'header' },
    });
    expect(notes).toContain('Repair parsing');
    expect(notes).not.toContain('Initial packages');
    expect(notes).not.toContain('unrelated');
    expect(notes).not.toContain('chore(release)');
    await expect(readUnreleasedPackage(validated)).rejects.toThrow('Nothing to release');
  });

  test('fails without package changes even when sibling commits and tags exist', async () => {
    await git(['tag', 'core-v0.0.10']);
    await Bun.write(join(repoRoot, 'packages/env/src/index.ts'), 'export const env = true;\n');
    await commit('feat(env): another feature');
    await git(['tag', 'env-v0.0.4']);
    await expect(preparePackageRelease({ packageName: 'core', repoRoot })).rejects.toThrow(
      'Nothing to release',
    );
    const manifest = await Bun.file(join(repoRoot, 'packages/core/pkg/package.json')).json();
    expect(manifest.version).toBe('0.0.10');
  });

  test('boots from the existing manifest and scoped history when there are no tags', async () => {
    const release = await preparePackageRelease({ packageName: 'core', repoRoot });
    expect(release.version).toBe('0.1.0');
    expect(await Bun.file(release.changelogPath).text()).toContain('Initial packages');
  });

  test('infers a minor bump from a pre-1.0 breaking change and rejects unsafe package names', async () => {
    await git(['tag', 'core-v0.0.10']);
    await Bun.write(join(repoRoot, 'packages/core/src/index.ts'), 'export const changed = true;\n');
    await commit('feat(core)!: incompatible change');
    const release = await preparePackageRelease({ packageName: 'core', repoRoot });
    expect(release.version).toBe('0.1.0');
    await expect(readReleasePackage({ packageName: '../core', repoRoot })).rejects.toThrow(
      'Invalid package',
    );
  });

  test.each([
    { baseline: '0.0.10', message: 'fix(core): repair parsing', expected: '0.0.11' },
    { baseline: '0.0.10', message: 'feat(core): add an option', expected: '0.1.0' },
    { baseline: '0.0.10', message: 'feat(core)!: change the API', expected: '0.1.0' },
    { baseline: '0.1.0', message: 'fix(core): repair parsing', expected: '0.1.1' },
    { baseline: '0.3.4', message: 'feat(core)!: change the API', expected: '0.4.0' },
    {
      baseline: '0.3.4',
      message: 'fix(core): change parsing\n\nBREAKING CHANGE: removes legacy parsing',
      expected: '0.4.0',
    },
    { baseline: '1.4.2', message: 'fix(core): repair parsing', expected: '1.4.3' },
    { baseline: '1.4.2', message: 'feat(core): add an option', expected: '1.5.0' },
    { baseline: '1.4.2', message: 'feat(core)!: change the API', expected: '2.0.0' },
    {
      baseline: '1.4.2',
      message: 'fix(core): change parsing\n\nBREAKING CHANGE: removes legacy parsing',
      expected: '2.0.0',
    },
  ])('infers semver from %j', async ({ baseline, message, expected }) => {
    const manifestPath = join(repoRoot, 'packages/core/pkg/package.json');
    const manifest = await Bun.file(manifestPath).json();
    await Bun.write(manifestPath, JSON.stringify({ ...manifest, version: baseline }));
    await commit('chore(release): baseline');
    await git(['tag', `core-v${baseline}`]);
    await Bun.write(join(repoRoot, 'packages/core/src/index.ts'), 'export const fixed = true;\n');
    await commit('fix(core): earlier patch');
    await Bun.write(join(repoRoot, 'packages/core/src/index.ts'), 'export const added = true;\n');
    await commit(message);

    const releasePackage = await readReleasePackage({ packageName: 'core', repoRoot });
    expect(await nextPackageVersion(releasePackage)).toBe(expected);
  });

  test('does not release housekeeping commits', async () => {
    await git(['tag', 'core-v0.0.10']);
    await Bun.write(join(repoRoot, 'packages/core/CHANGELOG.md'), '# Changelog\n');
    await commit('chore(release): update changelog');
    await expect(preparePackageRelease({ packageName: 'core', repoRoot })).rejects.toThrow(
      'Nothing to release',
    );
  });

  test('rejects a version baseline that disagrees with the last package tag', async () => {
    await git(['tag', 'core-v0.0.9']);
    await Bun.write(join(repoRoot, 'packages/core/src/index.ts'), 'export const fixed = true;\n');
    await commit('fix(core): repair parsing');
    await expect(preparePackageRelease({ packageName: 'core', repoRoot })).rejects.toThrow(
      'Last release tag core-v0.0.9 does not match core-v0.0.10',
    );
    const manifest = await Bun.file(join(repoRoot, 'packages/core/pkg/package.json')).json();
    expect(manifest.version).toBe('0.0.10');
  });
});

describe('release tag validation', () => {
  test('rejects malformed versions, unknown packages, and mismatched manifest versions', async () => {
    for (const tag of ['v0.0.10', 'core-v00.0.10', 'core-v0.0.10-beta.1', '../core-v0.0.10']) {
      await expect(validateReleaseTag({ tag, repoRoot })).rejects.toThrow();
    }
    await expect(validateReleaseTag({ tag: 'unknown-v0.0.1', repoRoot })).rejects.toThrow();
    await expect(validateReleaseTag({ tag: 'core-v0.0.11', repoRoot })).rejects.toThrow(
      'does not match the package version',
    );
  });

  test('rejects private packages', async () => {
    await Bun.write(
      join(repoRoot, 'packages/core/pkg/package.json'),
      JSON.stringify({ name: '@parshjs/core', version: '0.0.10', private: true }),
    );
    await expect(readReleasePackage({ packageName: 'core', repoRoot })).rejects.toThrow(
      'Not a public parsh package',
    );
  });

  test('rejects tags that point elsewhere and commits outside main', async () => {
    await git(['tag', 'core-v0.0.10']);
    await commit('docs: follow-up');
    await git(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
    await expect(validateReleaseTag({ tag: 'core-v0.0.10', repoRoot })).rejects.toThrow(
      'does not point to the checked-out commit',
    );
    await git(['checkout', '-b', 'unmerged']);
    await commit('feat(core): unmerged work');
    await git(['tag', '-f', 'core-v0.0.10']);
    await expect(validateReleaseTag({ tag: 'core-v0.0.10', repoRoot })).rejects.toThrow();
  });
});
