#!/usr/bin/env bun
import { createCli } from '@repo/core';
import { commandTree } from './commandTree.gen.ts';

/** Injected at build time */
declare const __VERSION__: string;

await createCli({
  programName: 'pomo',
  programDescription: 'A pomodoro timer with a live Ink countdown.',
  version: __VERSION__,
  tree: commandTree,
}).main();
