import { watch } from 'node:fs';
import { resolve } from 'node:path';
import { defineCommand } from '@repo/core';
import { z } from 'zod';
import { type GenerateOptions, generateCommandTree } from '#generate.ts';

export const command = defineCommand('generate', {
  options: {
    commands: z.string().default('./src/commands'),
    out: z.string().default('./src/commandTree.gen.ts'),
    'root-options': z.string().optional(),
    'core-module': z.string().optional(),
    watch: z.boolean().default(false),
  },
  handler: async (ctx) => {
    const commandsDir = resolve(ctx.options.commands);
    const outFile = resolve(ctx.options.out);
    const opts: GenerateOptions = {
      commandsDir,
      outFile,
      ...(ctx.options['root-options'] !== undefined
        ? { rootOptionsTypeExpr: ctx.options['root-options'] }
        : {}),
      ...(ctx.options['core-module'] !== undefined
        ? { coreModule: ctx.options['core-module'] }
        : {}),
    };

    const runOnce = async (): Promise<void> => {
      try {
        await generateCommandTree(opts);
        console.log(`parsh-codegen: wrote ${outFile}`);
      } catch (err) {
        console.error((err as Error).message);
        if (!ctx.options.watch) {
          process.exit(1);
        }
      }
    };

    await runOnce();

    if (ctx.options.watch) {
      console.log(`parsh-codegen: watching ${commandsDir} for adds/removes/renames…`);
      let debounce: ReturnType<typeof setTimeout> | null = null;
      watch(commandsDir, { recursive: true }, () => {
        if (debounce) {
          clearTimeout(debounce);
        }
        debounce = setTimeout(() => {
          void runOnce();
        }, 75);
      });
    }
  },
});
