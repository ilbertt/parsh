import { defineCommand } from '@repo/core';
import { ensureConfig } from '../../hooks/ensure-config.ts';

export const command = defineCommand('config get', {
  description: 'Print the current configuration.',
  options: {},
  beforeHandler: ensureConfig,
  handler: async (ctx) => {
    const cfg = await ctx.files.config.read();
    console.log(`config file: ${ctx.files.config.path}`);
    console.log(JSON.stringify(cfg, null, 2));
  },
});
