#!/usr/bin/env bun
import { join } from 'node:path';
import { createCli } from '@repo/core';
import { createFilesContext, osHomeConfigDir } from '@repo/files';
import { commandTree } from './commandTree.gen.ts';
import { envVars } from './env.ts';
import { credentialsSchema } from './files.ts';

const cli = createCli({
  programName: 'awslike',
  programDescription: 'A fake AWS CLI.',
  tree: commandTree,
  context: {
    files: createFilesContext({
      basePath: join(osHomeConfigDir(), 'awslike'),
      files: {
        credentials: { filename: 'credentials.json', schema: credentialsSchema },
      },
    }),
    env: envVars,
  },
});

declare module '@repo/core' {
  interface Register {
    cli: typeof cli;
  }
}

await cli.main();
