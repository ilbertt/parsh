# scaffold

A `create-app`-style CLI built with parsh + [@clack/prompts](https://github.com/bombshell-dev/clack). Demonstrates how a parsh handler can drive an interactive wizard without `@parshjs/core` knowing anything about prompts.

```sh
bun run generate                    # regenerate src/commandTree.gen.ts
bun run start init                  # interactive wizard
bun run start init --name my-app --template node --yes
bun run start templates list
bun run start templates node show
```

The clack integration is just regular function calls inside `commands/init.ts` — there is no parsh-side prompt hook. Inquirer, prompts, etc. work the same way.

Generated projects land in `./<name>/` in the current working directory.
