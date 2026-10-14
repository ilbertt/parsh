# Changelog

## [core-v0.1.0]

### Features

- Support hidden options (#10)
- Add testing submodule
- **Breaking:** Remove `--watch` flag
- Type-safe command aliases via defineCommand (#6)
- OnError hook and custom error class registration (#2)
- `hidden` flag for hiding commands from help
- Version flag
- **Breaking:** Remove description from `defineRootCommand`
- Add ctx.print colored output helpers
- Colored output
- Wrap params with CommandParam shape, add required flag
- Option aliases with runtime collision detection
- Object-form options with forwardToChildren scoping
- Split read/maybeRead, drop defaults, drop phase prefix
- BeforeHandler/afterHandler lifecycle hooks
- Cli context, @parsh/files, config-store example
- Optional description per command
- Lazy command loading via dynamic import()
- Support root command
- **Breaking:** Reshape handler ctx with ctx.parents[path] and add helpArg per command
- First MVP

### Fixes

- Accept partial print object in tests
- Reorder defineCommand overloads for option/param intellisense
- Enforce params types
- Do not print options if there are none
- Error on unknown tokens instead of routing through --help or alias
- Hide implicit branch nodes from root help
- Relative imports to emit proper paths
- Print default flags in the help output
- Validate numbers

### Refactoring

- Split files in smaller files (#5)
- Runtime schema probing replaces codegen option sniffer (#4)
- Parshjs org name
- Rename ctx.root.options to ctx.rootOptions
- Expose user context under ctx.context
- Destructure ctx in handler args
- Destructure in the function input
- **Breaking:** Options instead of args

### Documentation

- Readmes and skills

### Build and dependencies

- Upgrade to Bun 1.4.3 and remove CLAUDE.md symlink (#12)
- Update dependencies across the monorepo (#7)

### Tests

- Add regression test for --help + trailing unknown after alias
- Use native `expectTypeOf` from `bun:test`
- Extract shared test helpers into helpers/
- Check version and help command output

### Other changes

- Don't allow re-exports in other files than index
- Bump released versions
- Release 0.0.3
- Bump versions
- Update readmes
- Formatting
- Prepare packages for publishing
- Stricter biome rules
- Clearer types test script
