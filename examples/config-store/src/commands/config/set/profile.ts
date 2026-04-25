import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('config set profile', {
  description: 'Set the active profile name.',
  options: { value: z.string().min(1) },
  beforeHandler: async (ctx) => {
    await ctx.files.config.ensureExists({
      message: 'No config found. Run `mycli config init` first.',
    });
  },
  handler: async (ctx) => {
    const current = (await ctx.files.config.read())!;
    await ctx.files.config.write({ ...current, profile: ctx.options.value });
    console.log(`profile = ${ctx.options.value}`);
  },
});
