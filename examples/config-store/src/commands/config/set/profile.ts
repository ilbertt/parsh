import { defineCommand } from '@repo/core';
import { z } from 'zod';
import { ensureConfig } from '../../../hooks/ensure-config.ts';

export const command = defineCommand('config set profile', {
  description: 'Set the active profile name.',
  options: { value: { schema: z.string().min(1) } },
  beforeHandler: ensureConfig,
  handler: async ({ options, files, print }) => {
    const current = await files.config.read();
    await files.config.write({ ...current, profile: options.value });
    print.success(`profile = ${options.value}`);
  },
});
