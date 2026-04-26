import { defineCommand } from '@repo/core';
import { z } from 'zod';
import { ensureConfig } from '../../../hooks/ensure-config.ts';

export const command = defineCommand('config set default-region', {
  description: 'Set the default AWS-style region.',
  options: { value: { schema: z.string().min(1) } },
  beforeHandler: ensureConfig,
  handler: async ({ options, context, print }) => {
    const current = await context.files.config.read();
    await context.files.config.write({ ...current, defaultRegion: options.value });
    print.success(`defaultRegion = ${options.value}`);
  },
});
