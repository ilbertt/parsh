#!/usr/bin/env bun
import { createCli } from '#index.ts';
import { commandTree } from './commandTree.gen.ts';

const code = await createCli({
  programName: 'loadtrack',
  tree: commandTree,
}).run(process.argv.slice(2));
process.exit(code);
