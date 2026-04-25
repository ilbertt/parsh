#!/usr/bin/env bun
import { createCli } from '@repo/core';
import { commandTree } from './commandTree.gen.ts';
import { envVarsContext } from './env.ts';
import { filesContext } from './files.ts';

const cli = createCli({
  programName: 'awslike',
  programDescription: 'A fake AWS CLI.',
  tree: commandTree,
  context: {
    files: filesContext,
    env: envVarsContext,
  },
});

declare module '@repo/core' {
  interface Register {
    cli: typeof cli;
  }
}

await cli.main();
