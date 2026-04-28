# httpie

A tiny [HTTPie](https://httpie.io)-style CLI built with parsh. Demonstrates:

- **Type-safe command aliases** — `httpie https://example.com` is an alias of `httpie GET https://example.com` declared with one line (`aliasOf: 'GET [url]'`).
- **Repeatable flags from array schemas** — `--header` / `-H` and `--query` / `-q` use `z.array(z.string())`, so passing the flag multiple times collects each value into an array. No special hint required.
- **Forwarded root options** — `--auth`, `--timeout`, `--follow`, `--verbose` are declared once on the root and read from `rootOptions` inside every method handler.
- **Param schemas with `z.url()`** — the `[url]` segment is validated as a URL before the handler runs.

## Run

```sh
bun install
bun --filter @repo/examples-httpie generate   # regenerate tree after touching commands/
bun --filter @repo/examples-httpie start -- GET https://httpbin.org/get
```

## Examples

```sh
# Bare URL → GET via alias
httpie https://httpbin.org/get

# Explicit method, repeatable query and header flags
httpie GET https://httpbin.org/get -q foo=bar -H 'X-Trace: 1' -H 'X-Trace: 2'

# JSON POST
httpie POST https://httpbin.org/post --data '{"a":1}'

# Verbose with auth
httpie -v --auth user:pass GET https://httpbin.org/basic-auth/user/pass
```

## Layout

```
src/commands/
  _root.ts             forwarded options
  [url].ts             alias of `GET [url]`
  GET/[url].ts         per-method handlers
  POST/[url].ts
  PUT/[url].ts
  PATCH/[url].ts
  DELETE/[url].ts
  HEAD/[url].ts
```

The shared `runRequest` helper in `src/request.ts` is just plain code — parsh stays out of the way once a handler is running.
