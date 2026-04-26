#!/usr/bin/env bun
import { createCli } from '@repo/core';
import { commandTree } from './commandTree.gen.ts';

/** Injected at build time */
declare const __VERSION__: string;

await createCli({
  programName: 'scaffold',
  programDescription: 'A create-app wizard built on parsh + clack.',
  version: __VERSION__,
  tree: commandTree,
}).main();
