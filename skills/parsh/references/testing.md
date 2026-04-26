# Testing

There are two useful levels for testing a parsh CLI. Pick whichever is cheaper for what you're proving.

| Level | Use | Tools |
| --- | --- | --- |
| **Handler unit test** | Logic inside one `handler` / `beforeHandler` / `afterHandler`. | Import the command, build a fake `ctx`, call the function directly. |
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
import { createCli } from '@parsh/core';
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

For `@parsh/env`, pass a `source` to `createEnvContext` to bypass `process.env`:

```ts
import { createEnvContext } from '@parsh/env';

context: {
  env: createEnvContext({
    source: { DATABASE_URL: 'postgres://test', PORT: '8080' },
    vars: { /* same vars as production */ },
  }),
}
```

For `@parsh/files`, point `basePath` at a temp dir created per test:

```ts
import { mkdtempSync, rmSync } from 'node:fs';
import { join, tmpdir } from 'node:path';
import { createFilesContext } from '@parsh/files';

const basePath = mkdtempSync(join(tmpdir(), 'mycli-test-'));
afterEach(() => rmSync(basePath, { recursive: true, force: true }));

context: {
  files: createFilesContext({ basePath, files: { /* … */ } }),
}
```

## Handler unit tests

When the test is really about logic inside one handler, skip the runner entirely. Import the command and call its `handler` with a fabricated `ctx` — remember to populate the framework fields (`options`, `params`, `parents`, `root`, `print`) and put your test doubles under `context`:

```ts
import { expect, test } from 'bun:test';
import { command } from '../src/commands/migrate.ts';

test('migrate writes the timestamp', async () => {
  const writes: unknown[] = [];
  const noopPrint = {
    info: () => {}, success: () => {}, warn: () => {}, error: () => {}, dim: () => {},
  };

  await command.handler!({
    options: {},
    params: {},
    parents: {},
    rootOptions: {},
    print: noopPrint,
    context: {
      db: { write: (v: unknown) => writes.push(v) },
      now: () => new Date('2026-01-01T00:00:00Z'),
    },
  } as never);

  expect(writes).toEqual([{ at: '2026-01-01T00:00:00.000Z' }]);
});
```

Note the `as never` (or `as any`) cast on the fabricated ctx — bypassing the registered context's type is fine **at the test boundary only**. Don't reach for casts inside production code.

This style is fastest, but it skips schema validation and lifecycle hooks. Use the integration form when you need to prove the full chain works.

## Testing lifecycle hooks

The `beforeHandler` → `handler` → `afterHandler` order, and the "throw aborts the rest" rule, are runner-level concerns. Test them through `cli.run(argv)`, not by calling the hooks directly:

```ts
test('beforeHandler throw aborts handler and afterHandler', async () => {
  const order: string[] = [];
  // … build a tree where each hook pushes onto `order`,
  //    and beforeHandler throws.
  const code = await createCli({ programName: 't', tree }).run(['cmd']);
  expect(code).not.toBe(0);
  expect(order).toEqual(['before']);
});
```

## Capturing stdout / stderr

Two channels to know about:

- **`ctx.print`** writes via `process.stdout.write` and `process.stderr.write`. Spy on those to assert handler output (see the integration-test example above).
- **Auto-generated help and runner errors** go through `console.log` / `console.error`. Swap or `spyOn` those to assert help/error text.

If your test framework has a built-in spy (`spyOn`, `vi.spyOn`, etc.), prefer it — it'll restore automatically.

For ANSI color output, the helpers in `@parsh/core`'s style module check `process.stdout.isTTY` / `NO_COLOR`, so test output is plain by default. If you need to assert against colored output, set `FORCE_COLOR=1` or assert against substrings rather than exact equality.

## What not to test

- **The codegen output (`commandTree.gen.ts`).** It's generated; if it's wrong, fix the source under `commands/` and regenerate.
- **Standard Schema validation itself.** Trust the schema lib. Test that *your* command rejects what you expect — not that Zod parses a number.
- **`process.exit`.** Use `cli.run(argv)` and assert the returned exit code instead.
