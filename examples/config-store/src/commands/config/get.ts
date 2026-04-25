import { defineCommand } from '@repo/core';

export const command = defineCommand('config get', {
  description: 'Print the current configuration.',
  options: {},
  handler: async (ctx) => {
    const cfg = await ctx.files.config.read();
    console.log(`config file: ${ctx.files.config.path}`);
    console.log(JSON.stringify(cfg, null, 2));
  },
});
