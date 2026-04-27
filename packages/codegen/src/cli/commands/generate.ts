import { watch } from 'node:fs';
import { basename, resolve } from 'node:path';
import { defineCommand } from '@repo/core';
import { z } from 'zod';
import { type GenerateOptions, generateCommandTree } from '../../generate.js';

const WATCH_DEBOUNCE_MS = 75;

function shouldTriggerRegen(filename: string | null): boolean {
  if (!filename) {
    return true;
  }
  const name = basename(filename);
  if (!name.includes('.')) {
    return true;
  }
  if (!name.endsWith('.ts')) {
    return false;
  }
  if (name.endsWith('.gen.ts') || name.endsWith('.test.ts')) {
    return false;
  }
  if (name.startsWith('_') && name !== '_root.ts') {
    return false;
  }
  return true;
}

export const command = defineCommand('generate', {
  options: {
    commands: { schema: z.string().default('./src/commands') },
    out: { schema: z.string().default('./src/commandTree.gen.ts') },
    'core-module': { schema: z.string().optional() },
    eager: { schema: z.boolean().default(false) },
    watch: { schema: z.boolean().default(false) },
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

    const runOnce = async (): Promise<void> => {
      try {
        await generateCommandTree(opts);
        print.success(`parsh-codegen: wrote ${outFile}`);
      } catch (err) {
        print.error((err as Error).message);
        if (!options.watch) {
          process.exit(1);
        }
      }
    };

    await runOnce();

    if (options.watch) {
      print.info(`parsh-codegen: watching ${commandsDir} for adds/removes/renames…`);
      let debounce: ReturnType<typeof setTimeout> | null = null;
      // biome-ignore lint/complexity/useMaxParams: fs.watch callback signature is (event, filename)
      watch(commandsDir, { recursive: true }, (_event, filename) => {
        if (!shouldTriggerRegen(typeof filename === 'string' ? filename : null)) {
          return;
        }
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
