#!/usr/bin/env bun
import { createCli } from '@parshjs/core';
import { commandTree } from './commandTree.gen.ts';
import { envVarsContext } from './env.ts';
import { filesContext } from './files.ts';

/** Injected at build time */
declare const __VERSION__: string;

const cli = createCli({
  programName: 'awslike',
  programDescription: 'A fake AWS CLI.',
  version: __VERSION__,
  tree: commandTree,
  context: {
    files: filesContext,
    env: envVarsContext,
  },
});

declare module '@parshjs/core' {
  interface Register {
    cli: typeof cli;
  }
}

await cli.main();
