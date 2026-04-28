# Error handling

Reference for `createCli({ errors, onError })`. For the basic shape, see the public README.

## Sites that fire `onError`

| `code` | When | `error` | `ctx` |
|---|---|---|---|
| `BuiltInErrorCode.Parse` | argv parse / unknown command | `Error` | `undefined` |
| `BuiltInErrorCode.Validation` | option/param schema rejection | `Error` | `undefined` |
| `BuiltInErrorCode.Load` | `commands/<path>` import failure | `CommandLoadError` | `undefined` |
| `BuiltInErrorCode.Unknown` | handler threw something unregistered | `Error` (normalized) | full handler ctx |
| any registered key | handler threw a matching class | `InstanceType<E[key]>` | full handler ctx |

`code` is a string enum — compare with either the enum (`code === BuiltInErrorCode.Parse`) or the string literal (`code === 'PARSE'`). `ctx` is `undefined` for pre-handler sites; narrow on `code` first. `print` is hoisted to the payload top level so it's reachable from any branch.

## Matching is `instanceof`, in object insertion order

The discriminant `code` is the **object key** in `errors`, not the class name. Walk is top-to-bottom; first hit wins, so register most-specific subclasses first or a parent will catch its children. Built-in code names are not reserved — registering under them is allowed but rarely useful.

## `exit(n)` vs throw vs void

- `return exit(n)` → `cli.run()` resolves to `n`, default stderr suppressed.
- `return undefined` / `void` → falls through to the same default stderr + exit code as if `onError` weren't set.
- `throw` from `onError` → runtime emits `${prefix}: onError threw: <msg>` and exits `1`. **Does not recurse.**
