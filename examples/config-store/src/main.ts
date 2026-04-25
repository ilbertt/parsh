#!/usr/bin/env bun
import { join } from 'node:path';
import { createCli } from '@repo/core';
import { createFilesContext, osHomeConfigDir } from '@repo/files';
import { commandTree } from './commandTree.gen.ts';
import { configSchema, DEFAULT_CONFIG } from './files.ts';

export const cli = createCli({
  programName: 'mycli',
  programDescription: 'A demo CLI with persistent JSON config.',
  tree: commandTree,
  context: {
    files: createFilesContext({
      basePath: join(osHomeConfigDir(), 'mycli'),
      files: {
        config: {
          filename: 'config.json',
          schema: configSchema,
          defaults: DEFAULT_CONFIG,
        },
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
