# awslike

An example parsh CLI showcasing deeply nested commands, modeled loosely after the AWS CLI shape.

```sh
bun run generate   # regenerate src/commandTree.gen.ts from src/commands/
bun run start <command> [...]
```

Edit or add files under `src/commands/` and re-run `generate`.

## Error handling

`src/errors.ts` defines two custom error classes (`NotAuthorized`, `InvalidRegion`), each carrying a `static readonly code`. They are registered with `createCli({ errors, onError })` in `src/main.ts` so a handler can `throw new NotAuthorized(...)` and the centralized `onError` hook narrows by `code`, prints a tailored message, and returns a specific exit code.

Try it:

```sh
bun run start ec2 create --identity guest --name x --cpuCount 1   # exit 77
bun run start ec2 create --identity user --region mars-1 --name x --cpuCount 1   # exit 75
```
