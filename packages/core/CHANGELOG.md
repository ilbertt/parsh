# Changelog

## [core-v0.1.0]

### Features

- Support hidden options (#10) (07b8bea)
- Add testing submodule (e0cbcfb)
- **Breaking:** Remove `--watch` flag (0009c02)
- Type-safe command aliases via defineCommand (#6) (ee2e534)
- OnError hook and custom error class registration (#2) (9c5feaf)
- `hidden` flag for hiding commands from help (4b7575d)
- Version flag (a40473c)
- **Breaking:** Remove description from `defineRootCommand` (829190c)
- Add ctx.print colored output helpers (83d53d7)
- Colored output (0483301)
- Wrap params with CommandParam shape, add required flag (cb15d2f)
- Option aliases with runtime collision detection (3a2e066)
- Object-form options with forwardToChildren scoping (718373f)
- Split read/maybeRead, drop defaults, drop phase prefix (6d27cb9)
- BeforeHandler/afterHandler lifecycle hooks (84aad2f)
- Cli context, @parsh/files, config-store example (fa30e6e)
- Optional description per command (c88c3ce)
- Lazy command loading via dynamic import() (a84fd24)
- Support root command (bbc82bf)
- **Breaking:** Reshape handler ctx with ctx.parents[path] and add helpArg per command (57d3663)
- First MVP (21747bd)

### Fixes

- Accept partial print object in tests (3a41055)
- Reorder defineCommand overloads for option/param intellisense (93aefd9)
- Enforce params types (4655300)
- Do not print options if there are none (7c219a5)
- Error on unknown tokens instead of routing through --help or alias (b9e1053)
- Hide implicit branch nodes from root help (31407cb)
- Relative imports to emit proper paths (ffae2de)
- Print default flags in the help output (baf465c)
- Validate numbers (5af8108)

### Refactoring

- Split files in smaller files (#5) (3a64b7a)
- Runtime schema probing replaces codegen option sniffer (#4) (9b01474)
- Parshjs org name (72b2995)
- Rename ctx.root.options to ctx.rootOptions (dd5af34)
- Expose user context under ctx.context (c26562f)
- Destructure ctx in handler args (9dda06c)
- Destructure in the function input (64a3ce0)
- **Breaking:** Options instead of args (efc04c8)

### Documentation

- Readmes and skills (b25f2da)

### Build and dependencies

- Upgrade to Bun 1.4.3 and remove CLAUDE.md symlink (#12) (a13e660)
- Update dependencies across the monorepo (#7) (7f06421)

### Tests

- Add regression test for --help + trailing unknown after alias (787c9e3)
- Use native `expectTypeOf` from `bun:test` (ca8eaa0)
- Extract shared test helpers into helpers/ (340d9d2)
- Check version and help command output (87dd99b)

### Other changes

- Don't allow re-exports in other files than index (d19664b)
- Bump released versions (c68d9b2)
- Release 0.0.3 (b5f43fc)
- Bump versions (6e67d96)
- Update readmes (e7a84a3)
- Formatting (517d310)
- Prepare packages for publishing (d74502d)
- Stricter biome rules (e2b04bf)
- Clearer types test script (836d0e6)
