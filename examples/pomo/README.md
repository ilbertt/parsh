# pomo

A pomodoro timer CLI built with parsh + [Ink](https://github.com/vadimdemedes/ink). Demonstrates how a parsh handler can render a live TUI without `@parshjs/core` knowing anything about React.

State is persisted to `~/.pomo-example.json`.

```sh
bun run generate                         # regenerate src/commandTree.gen.ts
bun run start tasks add --title "Ship demo"
bun run start tasks list
bun run start start --duration 1         # live Ink countdown
bun run start stats
```

The Ink integration is just `render(<Timer/>)` inside `commands/start.ts` — there is no parsh-side renderer hook. Any TUI library works the same way.
