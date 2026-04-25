#!/usr/bin/env bun
import { createCli } from '@repo/core';
import { commandTree } from './commandTree.gen.ts';

await createCli({
  programName: 'awslike',
  programDescription: 'A fake AWS CLI.',
  tree: commandTree,
}).main();
