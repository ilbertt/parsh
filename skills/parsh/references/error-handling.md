# Error handling

Reference for centralized error handling on a parsh CLI: registering custom error classes, the `onError` hook, exit-code control, and the matching policy.

## When to reach for it

- Map specific errors to specific exit codes without sprinkling `process.exit` through handlers.
- Render errors consistently (custom prefix, telemetry, redaction) regardless of where they originate.
- Give pre-handler failures (parse, validation, command load) the same treatment as handler exceptions.

**Don't** use it as a router for per-handler business logic — the hook is a backstop. Keep validation flow inside the handler.

## Register custom error classes

Each class carries the discriminant on a `static readonly code = '<Name>' as const`. The literal `as const` is what makes `onError` narrow correctly.

```ts
class NotAuthorized extends Error {
  static readonly code = 'NotAuthorized' as const;
}

class RateLimited extends Error {
  static readonly code = 'RateLimited' as const;
  readonly retryAfter: number;
  constructor(retryAfter: number) {
    super(`rate limited (retry after ${retryAfter}s)`);
    this.retryAfter = retryAfter;
  }
}
```

Pass them to `createCli` under `errors`. Object keys are decorative — only `static code` drives the discriminant. Insertion order controls the `instanceof` walk.

```ts
createCli({
  programName: 'mycli',
  tree: commandTree,
  errors: { NotAuthorized, RateLimited },
  onError: ({ code, error, ctx, exit }) => {
    if (code === 'NotAuthorized') {
      ctx.print.error(error.message);
      return exit(77);
    }
    if (code === 'RateLimited') {
      ctx.print.warn(`retry in ${error.retryAfter}s`);
      return exit(75);
    }
    // void → fall through to the default stderr line + exit code
  },
});
```

Throw the class anywhere in a handler (`throw new NotAuthorized(...)`) and `onError` sees it with `code` narrowed to its static value and `error` narrowed to its instance type.

## The four built-in codes

`onError` also fires for every framework error site. The `code` union therefore always includes:

| Code | When it fires | `error` type | `ctx` |
|---|---|---|---|
| `'PARSE'` | argv parsing or unknown command | `Error` | `undefined` |
| `'VALIDATION'` | option/param schema rejection | `Error` | `undefined` |
| `'LOAD'` | `commands/<path>` import failure | `CommandLoadError` | `undefined` |
| `'UNKNOWN'` | handler threw something not in `errors` | `unknown` | full handler ctx |

Pre-handler sites (PARSE, VALIDATION, LOAD) carry `ctx: undefined` because the handler context isn't built yet — `code` narrowing handles this for you (TypeScript flags `ctx.print` as a property of `undefined` until you've narrowed away those branches).

`'UNKNOWN'` covers the case where a handler `throw`s something that isn't an instance of any registered class (or isn't an Error at all, like `throw 'oops'`). Don't try to inspect the value blindly — register the class instead.

## `exit(n)` semantics

The `exit` helper on the payload returns a sentinel object the runtime checks for:

- **Return `exit(n)`** → `cli.run()` resolves to `n`. The default `${prefix}: ${msg}` stderr line is **not** written; you own the output.
- **Return `void` / `undefined`** → fall through to default rendering. Same exit code and stderr as if no `onError` were configured.
- **Throw inside `onError`** → runtime writes `${prefix}: onError threw: ${msg}` and exits `1`. **It does not recurse** into the hook for that secondary error.

Async `onError` works — return a `Promise<ExitSignal | void>`.

```ts
onError: async ({ exit }) => {
  await reportToTelemetry();
  return exit(1);
}
```

## Matching policy

The runtime walks `Object.values(errors)` in insertion order and picks the first class where `error instanceof cls`. That class's `static code` becomes the discriminant.

**Register most-specific subclasses first.** If `class Child extends Parent` and you register `{ Parent, Child }`, every `Child` instance matches `Parent` first — the `Child` branch in `onError` becomes dead code. Reverse the order.

If no class matches, the code is `'UNKNOWN'`.

## Reserved names

`'PARSE'`, `'VALIDATION'`, `'LOAD'`, `'UNKNOWN'` are reserved. Registering a class whose `static code` is one of those is a **compile error** at the `errors` field, not a runtime surprise:

```ts
class Bad extends Error {
  static readonly code = 'PARSE' as const;
}

createCli({
  // …
  // ❌ Type-level error: 'PARSE' is a built-in error code and cannot be used as a custom error code
  errors: { Bad },
});
```

## Type-level shape

For users who want to extract the callback to a named function:

```ts
import type { OnError } from '@parshjs/core';

const onError: OnError<{ NotAuthorized: typeof NotAuthorized }, { /* ctx.context */ }> = (
  { code, error, ctx, exit },
) => {
  // …
};
```

In practice you rarely need this — passing `onError` inline preserves all inference automatically.

## Common mistakes

- **Forgetting `as const` on `static code`.** Without it, the static type is `string` (not the literal), and `onError`'s discriminant collapses to `string` — narrowing stops working.
- **Registering a parent before its subclass.** First-match-wins means the subclass branch is unreachable.
- **Throwing from `onError`** instead of returning `exit(n)`. Throws surface as a single `onError threw` line and don't re-enter the hook.
- **Trying to read `ctx` on PARSE/VALIDATION/LOAD.** Those sites carry `ctx: undefined` — narrow on `code` first.
- **Putting business validation in `onError`.** Keep the hook centralized and small. Validate inside the handler and `throw` a registered class when you want the centralized path to fire.
