#!/usr/bin/env bun
import { makeCli } from './cli.ts';

/** Injected at build time */
declare const __VERSION__: string;

const cli = makeCli({
  context: { clock: () => new Date() },
  version: __VERSION__,
});

declare module '@parshjs/core' {
  interface Register {
    cli: typeof cli;
  }
}

await cli.main();
