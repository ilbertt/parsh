import { defineCommand } from '@repo/core';
import { z } from 'zod';
import { ensureConfig } from '../../../hooks/ensure-config.ts';

export const command = defineCommand('config set default-region', {
  description: 'Set the default AWS-style region.',
  options: { value: z.string().min(1) },
  beforeHandler: ensureConfig,
  handler: async (ctx) => {
    const current = await ctx.files.config.read();
    await ctx.files.config.write({ ...current, defaultRegion: ctx.options.value });
    console.log(`defaultRegion = ${ctx.options.value}`);
  },
});
