import { defineCommand } from '@repo/core';

export const command = defineCommand('config get', {
  description: 'Print the current configuration.',
  options: {},
  beforeHandler: async (ctx) => {
    await ctx.files.config.ensureExists({
      message: 'No config found. Run `mycli config init` first.',
    });
  },
  handler: async (ctx) => {
    // beforeHandler already gated on existence, so read() can't return null here.
    const cfg = (await ctx.files.config.read())!;
    console.log(`config file: ${ctx.files.config.path}`);
    console.log(JSON.stringify(cfg, null, 2));
  },
});
