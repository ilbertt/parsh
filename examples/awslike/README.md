# awslike

An example parsh CLI showcasing deeply nested commands, modeled loosely after the AWS CLI shape.

```sh
bun run generate   # regenerate src/commandTree.gen.ts from src/commands/
bun run start <command> [...]
```

Edit or add files under `src/commands/` and re-run `generate`.
