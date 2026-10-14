# Contributing to parsh

## Development setup

```bash
git clone https://github.com/ilbertt/parsh
cd parsh
bun install
# sanity checks
bun check:all
bun run test
bun run build
```

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages to the main branch. Make sure your PR title is in the correct format.

## Releases

Packages are versioned independently. Run the `prepare-release` action with the package's directory name (for example, `core`) and a `patch`, `minor`, or `major` bump. It opens a PR updating `packages/<package>/pkg/package.json`, `packages/<package>/CHANGELOG.md`, and `bun.lock`. The action fails if there are no new releasable commits for that package.

After merging, tag the merge commit on `main` using the commands in the release PR. Tags use `<package>-v<version>`, for example `core-v0.0.11`. The `publish` action validates the tag against the package manifest, runs checks, tests, and builds, publishes that package's `pkg/` directory to npm, and creates a GitHub release with package-specific notes.

Release logic lives in `packages/internal-scripts`. Its shared git-cliff configuration selects Conventional Commits touching `packages/<package>/**`, ignores release housekeeping commits, and only recognizes that package's tags. Changelogs are regenerated from history on each release. Before a package's first tag, its full history is included; sibling packages, examples, and repository-only changes are excluded. Release notes use the same scope and the current tag's commit range.

Before the first automated release:

- Allow GitHub Actions to create pull requests in the repository's Actions settings.
- Configure an [npm trusted publisher](https://docs.npmjs.com/trusted-publishers/) for each package: owner `ilbertt`, repository `parsh`, workflow `publish.yml`, environment `Publish`, with direct `npm publish` allowed. No npm token is needed.
- Optionally set the `RELEASE_TOKEN` Actions secret to a token with repository contents and pull-request write access so release PRs trigger CI. Without it, the workflow uses `GITHUB_TOKEN`; a maintainer must close and reopen the PR to trigger the existing `pull_request` checks ([GitHub's event rules](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)).
