import type { RegisteredContext } from '@parshjs/core';

export async function ensureConfig(ctx: { context: RegisteredContext }): Promise<void> {
  await ctx.context.files.config.ensureExists({
    message: 'No config found. Run `mycli config init` first.',
  });
}
