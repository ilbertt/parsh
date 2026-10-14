# Changelog

## [codegen-v0.1.0]

### Features

- **Breaking:** Remove `--watch` flag
- `hidden` flag for hiding commands from help
- Version flag
- **Breaking:** Remove description from `defineRootCommand`
- Add ctx.print colored output helpers
- Wrap params with CommandParam shape, add required flag
- Option aliases with runtime collision detection
- Object-form options with forwardToChildren scoping
- Cli context, @parsh/files, config-store example
- Optional description per command
- Lazy command loading via dynamic import()
- Support root command
- **Breaking:** Reshape handler ctx with ctx.parents[path] and add helpArg per command
- First MVP

### Fixes

- Use dirname instead of manually replacing strings (#1)
- Escape windows paths
- Relative imports to emit proper paths
- Filter watch events to skip irrelevant files

### Refactoring

- Runtime schema probing replaces codegen option sniffer (#4)
- Derive paramNames from path segments (#3)
- Parshjs org name
- Rename ctx.root.options to ctx.rootOptions
- Destructure ctx in handler args
- Swap regex extractor for TS Compiler API
- Destructure in the function input
- **Breaking:** Options instead of args
- Use internal @repo/core in codegen test fixtures

### Documentation

- Readmes and skills

### Tests

- Fix character

### Other changes

- Don't allow re-exports in other files than index
- Bump released versions
- Bump versions
- Update readmes
- Resolve catalog dependencies
- Ship cli bin only
- Stricter biome rules
