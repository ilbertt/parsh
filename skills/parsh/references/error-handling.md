# Error handling

Reference for the non-obvious parts of `createCli({ errors, onError })`. For the basic shape and a usage example, see [`packages/core/pkg/README.md`](https://www.npmjs.com/package/@parshjs/core) or the awslike example.

## What `onError` actually fires for

| Code | When | `error` | `ctx` |
|---|---|---|---|
| `'PARSE'` | argv parse / unknown command | `Error` | `undefined` |
| `'VALIDATION'` | option/param schema rejection | `Error` | `undefined` |
| `'LOAD'` | `commands/<path>` import failure | `CommandLoadError` | `undefined` |
| `'UNKNOWN'` | handler threw something unregistered (or non-Error) | `Error` (normalized) | full handler ctx |
| any registered key | handler threw a matching class | `InstanceType<E[key]>` | full handler ctx |

`ctx` is `undefined` for the three pre-handler sites because the handler context isn't built yet — narrow on `code` first. `print` is hoisted to the payload top level so you can render output from any branch without depending on `ctx`.

## Discriminant is the object key, not the class name

`errors: { Foo: Bar }` registers class `Bar` under code `'Foo'`. The shorthand `errors: { Foo }` makes them match. Class names are never inspected (safe under minification, and you can register the same class under multiple codes if you want).

## Matching is `instanceof`, in insertion order

Object.values(errors) walked top to bottom, first hit wins. If `class Child extends Parent` and you register `{ Parent, Child }`, every `Child` instance matches `Parent` first and the `Child` branch is unreachable. **Register most-specific subclasses first.**

## `exit(n)` vs throw vs void

- `return exit(n)` — `cli.run()` resolves to `n`, default stderr is suppressed.
- `return undefined` / `void` — falls through to the same `${prefix}: ${msg}` line and exit code as if `onError` weren't set.
- `throw` inside `onError` — runtime writes `${prefix}: onError threw: <msg>` and exits `1`. **Does not recurse** into the hook for the secondary error.

## Built-in codes are not reserved

You can register a class under `'PARSE'`, `'VALIDATION'`, `'LOAD'`, or `'UNKNOWN'` if you want — instances of your class will then surface under that code alongside the framework's own use of it. Mostly a footgun; rarely useful.

## Common mistakes

- **Registering a parent class before its subclass.** Subclass branch becomes dead code.
- **Throwing from `onError` instead of `return exit(n)`.** You lose the centralized rendering for that error and emit a confusing `onError threw` line.
- **Reading `ctx` on `'PARSE'` / `'VALIDATION'` / `'LOAD'`.** It's `undefined` — narrow on `code` first.
- **Putting per-handler validation logic inside `onError`.** The hook is a backstop. Validate inside the handler and `throw` a registered class to route through.
