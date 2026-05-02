# Testing

There are two useful levels for testing a parsh CLI. Pick whichever is cheaper for what you're proving.

| Level | Use | Tools |
| --- | --- | --- |
| **Handler unit test** | Logic inside one `handler` / `beforeHandler` / `afterHandler`, in isolation. | `@parshjs/core/testing` — `createTestCtx` to assemble a typed ctx, `runCommandHandler` (or `runCommandBeforeHandler` / `runCommandAfterHandler`) to fire just that hook. |
| **CLI integration test** | Routing, parsing, help output, error messages, exit codes, lifecycle ordering, multi-command flows. | `createCli({ … }).run(argv)` — drive the same code path `main()` does, but as a normal function call. |

## The `run` vs `main` distinction

Inside the `Cli` class:

- **`cli.main()`** reads `process.argv.slice(2)` and calls `process.exit(code)`. It's the production entrypoint, not test-friendly.
- **`cli.run(argv: string[]): Promise<number>`** takes argv as an array, dispatches, and **returns the exit code without exiting the process**. This is what tests should use.

Output channels:

- **Handler output via `ctx.print`** writes to `process.stdout.write` (`info` / `success` / `dim`) and `process.stderr.write` (`warn` / `error`).
- **Auto-generated help and runner errors** go through `console.log` / `console.error`.

Capture whichever channel matches the assertion you want to make.

## CLI integration tests

```ts
import { describe, expect, test } from 'bun:test';
import { createCli } from '@parshjs/core';
import { commandTree } from '../src/commandTree.gen.ts';

function makeCli() {
  return createCli({
    programName: 'mycli',
    tree: commandTree,
    context: {
      // inject test doubles here — see "Test doubles via context" below
      now: () => new Date('2026-01-01T00:00:00Z'),
    },
  });
}

function captureStdout(): { lines: () => string[]; restore: () => void } {
  const original = process.stdout.write.bind(process.stdout);
  const chunks: string[] = [];
  process.stdout.write = ((chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString());
    return true;
  }) as typeof process.stdout.write;
  return {
    lines: () => chunks.join('').split('\n').filter(Boolean),
    restore: () => {
      process.stdout.write = original;
    },
  };
}

describe('hello', () => {
  test('greets with the provided name', async () => {
    const out = captureStdout();
    try {
      const code = await makeCli().run(['hello', '--name', 'parsh']);
      expect(code).toBe(0);
      expect(out.lines().some((l) => l.includes('hello, parsh'))).toBe(true);
    } finally {
      out.restore();
    }
  });

  test('exits 2 on an unknown command', async () => {
    const code = await makeCli().run(['nope']);
    expect(code).toBe(2);
  });
});
```

Things to note:

- **Build a fresh `cli` per test** (or per file) so context state doesn't leak between cases.
- **Don't rely on the global `Register` augmentation** for typing in tests — pass `context` directly to `createCli` and TypeScript will infer the shape from the literal you pass.
- Exit codes follow the runner's contract: `0` on success, `2` on parse / unknown-command errors, non-zero on handler throws.

## Test doubles via context

Anything you'd normally inject (DB, HTTP client, clock, env, files) goes through `context`. In tests, pass the doubles in the same shape:

```ts
const cli = createCli({
  programName: 'mycli',
  tree: commandTree,
  context: {
    db: makeFakeDb(),
    now: () => new Date('2026-01-01T00:00:00Z'),
  },
});

await cli.run(['migrate']);
```

For `@parshjs/env`, pass a `source` to `createEnvContext` to bypass `process.env`:

```ts
import { createEnvContext } from '@parshjs/env';

context: {
  env: createEnvContext({
    source: { DATABASE_URL: 'postgres://test', PORT: '8080' },
    vars: { /* same vars as production */ },
  }),
}
```

For `@parshjs/files`, point `basePath` at a temp dir created per test:

```ts
import { mkdtempSync, rmSync } from 'node:fs';
import { join, tmpdir } from 'node:path';
import { createFilesContext } from '@parshjs/files';

const basePath = mkdtempSync(join(tmpdir(), 'mycli-test-'));
afterEach(() => rmSync(basePath, { recursive: true, force: true }));

context: {
  files: createFilesContext({ basePath, files: { /* … */ } }),
}
```

## Handler unit tests with `@parshjs/core/testing`

The `@parshjs/core/testing` submodule is a thin wrapper. **Ctx is the unit of composition**: build a typed `ctx` once with `createTestCtx`, then run any combination of hooks against it. Errors propagate as thrown rejections — assert with your framework's normal `rejects` matchers. There is no custom result type, no opinion about how to capture output.

| Helper | Purpose |
| --- | --- |
| `createTestCtx({ cmd, ... })` | Type-safe ctx assembler. Defaults `parents: {}`, `rootOptions: {}`, `print` to a silent no-op. |
| `runCommandBeforeHandler({ cmd, ctx })` | Awaits only `cmd.beforeHandler`. Throws if the cmd has no `beforeHandler`. |
| `runCommandHandler({ cmd, ctx })` | Awaits only `cmd.handler`. Throws if the cmd has no `handler`. |
| `runCommandAfterHandler({ cmd, ctx })` | Awaits only `cmd.afterHandler`. Throws if the cmd has no `afterHandler`. |
| `runCommand({ cmd, ctx })` | Runs `beforeHandler → handler → afterHandler` with the same "throw aborts the rest" semantics as the router. |

That's the whole API. Five exports, zero exported types.

### Mocking `print`

`Print` is just an interface (`{ info, success, warn, error, dim }` — five callables). Build whatever satisfies it, with whatever your framework provides:

```ts
// vitest
import { vi } from 'vitest';
const print = { info: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn(), dim: vi.fn() };
expect(print.success).toHaveBeenCalledWith('uploaded');

// bun:test
import { mock } from 'bun:test';
const print = { info: mock(), success: mock(), warn: mock(), error: mock(), dim: mock() };
expect(print.success).toHaveBeenCalledWith('uploaded');

// Framework-free — capture into your own arrays
const stdout: string[] = [];
const print = {
  info: (m: string) => stdout.push(m), success: (m: string) => stdout.push(m),
  warn: () => {}, error: () => {}, dim: () => {},
};
```

If you don't pass one, `createTestCtx` fills in a silent no-op so the handler doesn't crash on `ctx.print.success(...)`.

### Single-handler test

```ts
import { expect, test, vi } from 'vitest';
import { createTestCtx, runCommandHandler } from '@parshjs/core/testing';
import { command } from '../src/commands/migrate.ts';

test('migrate writes the timestamp', async () => {
  const writes: unknown[] = [];
  const print = { info: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn(), dim: vi.fn() };
  const ctx = createTestCtx({
    cmd: command,
    options: {},
    params: {},
    context: {
      db: { write: (v: unknown) => writes.push(v) },
      now: () => new Date('2026-01-01T00:00:00Z'),
    },
    print,
  });

  await runCommandHandler({ cmd: command, ctx });

  expect(writes).toEqual([{ at: '2026-01-01T00:00:00.000Z' }]);
  expect(print.success).toHaveBeenCalledWith('migrated');
});
```

### Atomic vs composed lifecycle

The atomic runners are how you prove **one hook in isolation**. The composed `runCommand` is how you prove **the lifecycle contract** without going through the router:

```ts
import { runCommand, runCommandBeforeHandler } from '@parshjs/core/testing';

// Just before-handler — does it reject unauthenticated callers?
await expect(runCommandBeforeHandler({ cmd, ctx })).rejects.toThrow('unauthenticated');

// Full lifecycle — does the success path produce the right output and side effects?
await runCommand({ cmd, ctx });
expect(print.success).toHaveBeenCalledWith('done');
```

After a `rejects` failure your `print` mock still holds everything captured before the throw — useful for asserting "we logged the failure context before bailing".

### Validating raw inputs

`createTestCtx` does **not** validate `options` / `params`. That's deliberate — it lets you feed handlers deliberately weird inputs without fighting schemas. When you do want to assert that a schema rejects something, call the schema directly — `cmd.options.<name>.schema` and `cmd.params.<name>.schema` are public Standard Schema records:

```ts
const result = await cmd.options.force.schema['~standard'].validate('not-a-bool');
expect(result.issues).toBeDefined();
```

Or use your schema lib's native API. Validation is the schema lib's job; the testing helpers stay out of it.

### What these helpers don't cover

- **The "no handler → show usage" branch.** The router prints usage and exits 0 when a command has no `handler`. That's a router concern; drive it through `cli.run(argv)`.
- **Aliases.** Aliases have no handler — they delegate to the alias target at routing time. Test them through `cli.run(argv)`.
- **Argv parsing, help text, exit codes.** All router concerns. Use the integration form below.
- **Argv-flavored coercion** (`'42'` → `42`, `'true'` → `true`). The runner does this on raw argv strings; tests pass typed values to `createTestCtx` directly.
- **`onError`.** It's a router-level config, not a command. See the next section.

## Testing `onError`

`onError` lives on `createCli`, not on a command, so it sits between the integration and unit tiers. Two patterns, depending on what you're proving:

**Integration: drive `cli.run(argv)` with argv that triggers the error.** This is what you want when checking that errors are wired up end-to-end (registered, routed to `onError`, mapped to the right exit code, message reaching stderr).

```ts
const code = await makeCli({ context }).run(['greet', '--name', '   ']);
expect(code).toBe(3);                                    // your custom exit code
expect(stderr).toContain('name cannot be blank');
```

**Direct call: factor `onError` into its own export and call it from the test.** This is what you want when checking branching inside the function itself ("for code X, does it return `exit(N)` and print Y?"). `ExitSignal` is public; the payload is `OnErrorPayload<E, C> & { exit, print }`; your test framework provides the spies. No parsh helper needed.

```ts
// src/cli.ts
import { type OnError } from '@parshjs/core';
export const errors = { BlankNameError } as const;
export const onError: OnError<typeof errors, AppContext> = ({ code, error, exit, print }) => {
  if (code === 'BlankNameError') {
    print.error(`✘ ${error.message}`);
    return exit(3);
  }
};

// tests/onError.test.ts
import { ExitSignal } from '@parshjs/core';
import { onError } from '../src/cli.ts';

const print = { info: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn(), dim: vi.fn() };
const result = await onError({
  code: 'BlankNameError',
  error: new BlankNameError(),
  ctx: { options: {...}, params: {}, parents: {}, rootOptions: {}, print, context },
  print,
  exit: (n) => new ExitSignal(n),
});

expect(result).toBeInstanceOf(ExitSignal);
expect((result as ExitSignal).code).toBe(3);
expect(print.error).toHaveBeenCalledWith('✘ name cannot be blank');
```

For unhandled codes, the function returns `void` and the router falls back to `defaultExitCode` — assert with `expect(result).toBeUndefined()`.

See [`examples/with-vitest/tests/onError.test.ts`](../../../examples/with-vitest/tests/onError.test.ts) for both patterns wired up end-to-end.

## Capturing stdout / stderr

Two channels to know about:

- **`ctx.print`** writes via `process.stdout.write` and `process.stderr.write`. Spy on those to assert handler output (see the integration-test example above).
- **Auto-generated help and runner errors** go through `console.log` / `console.error`. Swap or `spyOn` those to assert help/error text.

If your test framework has a built-in spy (`spyOn`, `vi.spyOn`, etc.), prefer it — it'll restore automatically.

For ANSI color output, the helpers in `@parshjs/core`'s style module check `process.stdout.isTTY` / `NO_COLOR`, so test output is plain by default. If you need to assert against colored output, set `FORCE_COLOR=1` or assert against substrings rather than exact equality.

## What not to test

- **The codegen output (`commandTree.gen.ts`).** It's generated; if it's wrong, fix the source under `commands/` and regenerate.
- **Standard Schema validation itself.** Trust the schema lib. Test that *your* command rejects what you expect — not that Zod parses a number.
- **`process.exit`.** Use `cli.run(argv)` and assert the returned exit code instead.
