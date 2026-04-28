#!/usr/bin/env bun
import { createCli } from '@parshjs/core';
import { commandTree } from './commandTree.gen.ts';

/** Injected at build time */
declare const __VERSION__: string;

const cli = createCli({
  programName: 'httpie',
  programDescription: 'A tiny httpie clone built with parsh.',
  version: __VERSION__,
  tree: commandTree,
});

declare module '@parshjs/core' {
  interface Register {
    cli: typeof cli;
  }
}

await cli.main();
