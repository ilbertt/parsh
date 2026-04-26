#!/usr/bin/env bun
import { createCli } from '@repo/core';
import { commandTree } from './commandTree.gen.ts';

const cli = createCli({
  programName: 'parsh-codegen',
  programDescription: 'Filesystem-driven command tree generator for parsh.',
  tree: commandTree,
});

await cli.main();
