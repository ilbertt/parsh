# with-vitest

A minimal parsh CLI wired up with [vitest](https://vitest.dev) tests.

The CLI defines one command, `greet`, that demonstrates the seams worth testing:

- **An option schema** (`--name` required, `--shout` boolean).
- **A `beforeHandler`** that gates output based on `ctx.context.clock()`.
- **A `handler`** that branches on options + context.
- **An `afterHandler`** for cleanup output.

## Two test levels, two test files

- [`tests/greet.integration.test.ts`](tests/greet.integration.test.ts) — drives the full router via `cli.run(argv)`. Asserts on exit codes and on output captured from `process.stdout`. Use this when you care about argv parsing, the lifecycle order, exit codes, or the help text.
- [`tests/greet.unit.test.ts`](tests/greet.unit.test.ts) — uses `@parshjs/core/testing` to call individual hooks directly. `createTestCtx` builds a typed `ctx`; `runCommandBeforeHandler` / `runCommandHandler` / `runCommand` fire the lifecycle pieces. `print` is a record of `vi.fn()` so assertions use vitest's spy matchers (`toHaveBeenCalledWith`, `toHaveBeenCalledExactlyOnceWith`, `mock.invocationCallOrder`). Use this when you care about the logic inside one handler without the router in the way.
- [`tests/onError.test.ts`](tests/onError.test.ts) — covers both patterns for testing `onError`: integration through `cli.run(argv)` (does the error route end-to-end?) and direct invocation of the exported `onError` function with a hand-built payload (does the branching logic inside it do the right thing?). `onError` lives on `createCli` rather than `defineCommand`, so it sits between the integration and unit tiers.

Both files inject `clock` through `context` so tests are deterministic regardless of when they run.

## Run

```sh
bun run generate   # produce src/commandTree.gen.ts
bun run test       # vitest run
bun run start      # build & invoke: greeter greet --name parsh
```

For the full testing reference (including bun:test patterns and what these helpers don't cover), see [`skills/parsh/references/testing.md`](../../skills/parsh/references/testing.md).
