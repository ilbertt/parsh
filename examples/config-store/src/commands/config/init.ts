import { defineCommand } from '@repo/core';
import { DEFAULT_CONFIG } from '../../files.ts';

export const command = defineCommand('config init', {
  description: 'Create the config file with default values.',
  options: {},
  handler: async (ctx) => {
    await ctx.files.config.write(DEFAULT_CONFIG);
    console.log(`wrote ${ctx.files.config.path}`);
  },
});
