import { resolve } from 'node:path';
import { defineCommand } from '@repo/core';
import { z } from 'zod';
import { type GenerateOptions, generateCommandTree } from '../../generate.js';

export const command = defineCommand('generate', {
  options: {
    commands: { schema: z.string().default('./src/commands') },
    out: { schema: z.string().default('./src/commandTree.gen.ts') },
    'core-module': { schema: z.string().optional() },
    eager: { schema: z.boolean().default(false) },
  },
  handler: async ({ options, print }) => {
    const commandsDir = resolve(options.commands);
    const outFile = resolve(options.out);
    const opts: GenerateOptions = {
      commandsDir,
      outFile,
      eager: options.eager,
      ...(options['core-module'] !== undefined ? { coreModule: options['core-module'] } : {}),
    };

    try {
      await generateCommandTree(opts);
      print.success(`parsh-codegen: wrote ${outFile}`);
    } catch (err) {
      print.error((err as Error).message);
      process.exit(1);
    }
  },
});
