#!/usr/bin/env bun
import { createCli } from '@repo/core';
import { createEnvContext } from '@repo/env';
import { commandTree } from './commandTree.gen.ts';
import { databaseUrlSchema, nodeEnvSchema, portSchema } from './env.ts';

export const cli = createCli({
  programName: 'envcli',
  programDescription: 'Demo CLI showing lazy, type-safe env var validation.',
  tree: commandTree,
  context: {
    env: createEnvContext({
      vars: {
        PORT: { schema: portSchema, default: 3000 },
        NODE_ENV: { schema: nodeEnvSchema, default: 'development' },
        DATABASE_URL: { schema: databaseUrlSchema },
      },
    }),
  },
});

declare module '@repo/core' {
  interface Register {
    cli: typeof cli;
  }
}

await cli.main();
