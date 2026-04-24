#!/usr/bin/env bun
import { createCLI } from '@repo/core';
import { commandTree } from './commandTree.gen.ts';

await createCLI({ tree: commandTree }).main();
