#!/usr/bin/env bun
import { createCli } from '@parshjs/core';
import { commandTree } from './commandTree.gen.ts';
import { envVarsContext } from './env.ts';
import { InvalidRegion, NotAuthorized } from './errors.ts';
import { filesContext } from './files.ts';

/** Injected at build time */
declare const __VERSION__: string;

const EXIT_NOT_AUTHORIZED = 77;
const EXIT_INVALID_REGION = 75;

const cli = createCli({
  programName: 'awslike',
  programDescription: 'A fake AWS CLI.',
  version: __VERSION__,
  tree: commandTree,
  context: {
    files: filesContext,
    env: envVarsContext,
  },
  errors: { NotAuthorized, InvalidRegion },
  onError: ({ code, error, ctx, exit }) => {
    if (code === 'NotAuthorized') {
      ctx.print.error(error.message);
      ctx.print.dim('Run `awslike configure` to set credentials, then retry.');
      return exit(EXIT_NOT_AUTHORIZED);
    }
    if (code === 'InvalidRegion') {
      ctx.print.error(`unknown region: ${error.region}`);
      return exit(EXIT_INVALID_REGION);
    }
  },
});

declare module '@parshjs/core' {
  interface Register {
    cli: typeof cli;
  }
}

await cli.main();
