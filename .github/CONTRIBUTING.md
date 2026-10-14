# Contributing to parsh

## Development setup

Use the Bun version pinned in the root `package.json`'s `packageManager` field. CI reads the same pin.

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
