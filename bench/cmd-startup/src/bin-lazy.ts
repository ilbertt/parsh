#!/usr/bin/env bun
import { createCli } from '@repo/core';
import { commandTree } from './commandTree.lazy.gen.ts';

await createCli({ programName: 'bench', tree: commandTree }).main();
