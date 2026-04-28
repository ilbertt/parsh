#!/usr/bin/env node
import { createCli } from '@parshjs/core';
import { commandTree } from './commandTree.gen.ts';

const cli = createCli({
  programName: 'with-node',
  programDescription: 'A minimal parsh CLI compiled with tsc and run on Node.',
  version: '0.1.0',
  tree: commandTree,
});

declare module '@parshjs/core' {
  interface Register {
    cli: typeof cli;
  }
}

await cli.main();
