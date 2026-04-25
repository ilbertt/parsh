import { watch } from 'node:fs';
import { resolve } from 'node:path';
import { defineCommand } from '@repo/core';
import { z } from 'zod';
import { type GenerateOptions, generateCommandTree } from '#generate.ts';

const WATCH_DEBOUNCE_MS = 75;

export const command = defineCommand('generate', {
  options: {
    commands: { schema: z.string().default('./src/commands') },
    out: { schema: z.string().default('./src/commandTree.gen.ts') },
    'core-module': { schema: z.string().optional() },
    eager: { schema: z.boolean().default(false) },
    watch: { schema: z.boolean().default(false) },
  },
  handler: async ({ options }) => {
    const commandsDir = resolve(options.commands);
    const outFile = resolve(options.out);
    const opts: GenerateOptions = {
      commandsDir,
      outFile,
      eager: options.eager,
      ...(options['core-module'] !== undefined ? { coreModule: options['core-module'] } : {}),
    };

    const runOnce = async (): Promise<void> => {
      try {
        await generateCommandTree(opts);
        console.log(`parsh-codegen: wrote ${outFile}`);
      } catch (err) {
        console.error((err as Error).message);
        if (!options.watch) {
          process.exit(1);
        }
      }
    };

    await runOnce();

    if (options.watch) {
      console.log(`parsh-codegen: watching ${commandsDir} for adds/removes/renames…`);
      let debounce: ReturnType<typeof setTimeout> | null = null;
      watch(commandsDir, { recursive: true }, () => {
        if (debounce) {
          clearTimeout(debounce);
        }
        debounce = setTimeout(() => {
          void runOnce();
        }, WATCH_DEBOUNCE_MS);
      });
    }
  },
});
