import { watch } from 'node:fs';
import { resolve } from 'node:path';
import { defineCommand } from '@repo/core';
import { z } from 'zod';
import { type GenerateOptions, generateCommandTree } from '#generate.ts';

export const args = {
  commands: z.string().default('./src/commands'),
  out: z.string().default('./src/commandTree.gen.ts'),
  'root-args': z.string().optional(),
  'root-ctx': z.string().optional(),
  'core-module': z.string().optional(),
  watch: z.boolean().default(false),
};

export const command = defineCommand('generate', {
  args,
  handler: async (ctx) => {
    const commandsDir = resolve(ctx.args.commands);
    const outFile = resolve(ctx.args.out);
    const opts: GenerateOptions = {
      commandsDir,
      outFile,
      ...(ctx.args['root-args'] !== undefined ? { rootArgsTypeExpr: ctx.args['root-args'] } : {}),
      ...(ctx.args['root-ctx'] !== undefined ? { rootCtxTypeExpr: ctx.args['root-ctx'] } : {}),
      ...(ctx.args['core-module'] !== undefined ? { coreModule: ctx.args['core-module'] } : {}),
    };

    const runOnce = async (): Promise<void> => {
      try {
        await generateCommandTree(opts);
        console.log(`parsh-codegen: wrote ${outFile}`);
      } catch (err) {
        console.error((err as Error).message);
        if (!ctx.args.watch) {
          process.exit(1);
        }
      }
    };

    await runOnce();

    if (ctx.args.watch) {
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
