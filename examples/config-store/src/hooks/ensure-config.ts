import type { RegisteredContext } from '@repo/core';

export async function ensureConfig(ctx: RegisteredContext): Promise<void> {
  await ctx.files.config.ensureExists({
    message: 'No config found. Run `mycli config init` first.',
  });
}
