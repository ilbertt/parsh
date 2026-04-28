# Options and params

Reference for declaring CLI flags and positional params, and for reading them inside handlers.

## Options

Each option is a key under `options`. The `schema` is any [Standard Schema v1](https://standardschema.dev) value (Zod is shown here).

```ts
defineCommand('deploy', {
  options: {
    env:     { schema: z.enum(['staging', 'prod']), required: true, aliases: ['e'] },
    force:   { schema: z.boolean().optional() },
    tag:     { schema: z.string().optional(), description: 'Image tag' },
    timeout: { schema: z.number().int().positive().default(60) },
  },
  handler: ({ options }) => {
    options.env;     // 'staging' | 'prod'
    options.force;   // boolean | undefined
    options.tag;     // string | undefined
    options.timeout; // number
  },
});
```

### Optional vs. required

- **Optional value, no default:** `z.string().optional()` → `string | undefined`.
- **Optional with default:** `z.string().default('x')` → `string` (the default is applied if absent).
- **Required:** add `required: true`. The option errors before schema validation runs when the value is missing. The schema still drives the static type — make sure it doesn't admit `undefined` if you want a non-nullable type.

```ts
options: {
  format: { schema: z.enum(['json', 'text']).default('text') }, // 'json' | 'text'
  tag:    { schema: z.string().optional() },                    // string | undefined
  token:  { schema: z.string(), required: true },               // string, errors if missing
}
```

### Aliases

`aliases: ['v']` produces `-v`. Multi-character entries dispatch as `--xxx`. Aliases must not collide with sibling options or with forwarded ancestor options — collisions are reported at dispatch time on the loaded chain.

```ts
options: {
  verbose: { schema: z.boolean().optional(), aliases: ['v'] },
}
// usage: mycli --verbose   or   mycli -v
```

### Boolean flags

A `z.boolean()` schema becomes a presence flag — `--flag` sets it to `true`, absence leaves it `undefined` (or whatever your default is).

```ts
options: {
  dryRun: { schema: z.boolean().optional() },
}
```

### Repeatable flags

If the schema accepts an array, the flag is automatically repeatable — pass it once per value:

```ts
options: {
  header: { schema: z.array(z.string()).default([]) },
  // mycli req --header 'X-A: 1' --header 'X-B: 2'  →  options.header is ['X-A: 1', 'X-B: 2']
}
```

The "should this flag collect or overwrite" decision is made by probing the schema at dispatch — no extra config. Anything that accepts a `string[]` (or numeric/typed-element arrays) is treated as repeatable.

### Built-in coercion

Raw arg strings are tried as-is, then numerically, then as boolean — first success wins. So `z.number()` and `z.boolean()` work without `z.coerce.*`:

```ts
options: {
  port: { schema: z.number().int().positive().default(3000) }, // --port 8080
}
```

## Params (positional segments)

Params are the `[name]` segments in the path string. Their schemas live under `params` and **must use the same key as the bracketed segment**:

```ts
defineCommand('users [id] roles [role]', {
  params: {
    id:   { schema: z.string().uuid() },
    role: { schema: z.enum(['admin', 'editor', 'viewer']) },
  },
  options: {},
  handler: ({ params }) => {
    params.id;   // string
    params.role; // 'admin' | 'editor' | 'viewer'
  },
});
```

Wrong key, missing key, or extra key are **compile errors** — TypeScript enforces agreement between the path string and the `params` object.

`params.<key>` only contains the params declared on **this** command. Inherited ancestor params are reached through `parents['<ancestor path>'].params` (see below).

## Forwarding options to descendants

Mark an option `forwardToChildren: true` on a parent and every descendant sees it under `parents['<parent path>'].options` (and, for the root, the flat `ctx.rootOptions`).

```ts
// src/commands/_root.ts
defineRootCommand({
  options: {
    region: {
      schema: z.string().default('eu-west-2'),
      forwardToChildren: true,
      aliases: ['r'],
    },
  },
});

// src/commands/db.ts
defineCommand('db', {
  options: {
    profile: { schema: z.string().default('default'), forwardToChildren: true },
  },
});

// src/commands/db/migrate.ts
defineCommand('db migrate', {
  options: {},
  handler: ({ rootOptions, parents }) => {
    rootOptions.region;         // string
    parents.db.options.profile; // string
  },
});
```

Notes:

- **Without `forwardToChildren: true`, an option stays local** — it does not appear on descendants.
- The descendant inherits the *required-ness* of forwarded options too. A `required: true` flag on an ancestor must be passed when invoking any descendant.
- "Global to the whole CLI" → put the option on the **root** with `forwardToChildren: true`. Putting it on a deep parent only forwards within that subtree.

## Accessing ancestor state

Inside a handler:

| You want… | Reach for |
| --- | --- |
| Own options for this command | `ctx.options` |
| Own params for this command | `ctx.params` |
| A forwarded option from the root | `ctx.rootOptions.<name>` |
| A forwarded option from any parent | `ctx.parents['<parent path>'].options.<name>` |
| A param from any parent | `ctx.parents['<parent path>'].params.<name>` |
| Colored output helper | `ctx.print` (`info` / `success` / `warn` / `error` / `dim`) |
| Shared context (DB, env, files, …) | `ctx.context.<key>` (after `Register` augmentation) |

The keys under `parents` are the **literal path strings** of the ancestor commands. So a child of `'s3 buckets [name]'` reads its parent's param via `parents['s3 buckets [name]'].params.name`.
