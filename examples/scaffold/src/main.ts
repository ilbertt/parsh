#!/usr/bin/env bun
import { createCli } from '@repo/core';
import { commandTree } from './commandTree.gen.ts';

await createCli({
  programName: 'scaffold',
  programDescription: 'A create-app wizard built on parsh + clack.',
  tree: commandTree,
}).main();
