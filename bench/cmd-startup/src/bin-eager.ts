#!/usr/bin/env bun
import { createCli } from '@repo/core';
import { commandTree } from './commandTree.eager.gen.ts';

await createCli({ programName: 'bench', tree: commandTree }).main();
