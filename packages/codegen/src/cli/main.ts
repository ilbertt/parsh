#!/usr/bin/env bun
import { createCli } from '@repo/core';
import { commandTree } from './commandTree.gen.ts';

/** Injected at build time */
declare const __VERSION__: string;

const cli = createCli({
  programName: 'parsh-codegen',
  programDescription: 'Filesystem-driven command tree generator for parsh.',
  version: __VERSION__,
  tree: commandTree,
});

await cli.main();
