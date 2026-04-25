#!/usr/bin/env bun
import { createCli } from '@repo/core';
import { commandTree } from './commandTree.gen.ts';

await createCli({
  programName: 'pomo',
  programDescription: 'A pomodoro timer with a live Ink countdown.',
  tree: commandTree,
}).main();
