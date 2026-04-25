import { defineCommand } from '@repo/core';
import { z } from 'zod';
import { ensureConfig } from '../../../hooks/ensure-config.ts';

export const command = defineCommand('config set default-region', {
  description: 'Set the default AWS-style region.',
  options: { value: z.string().min(1) },
  beforeHandler: ensureConfig,
  handler: async ({ options, files }) => {
    const current = await files.config.read();
    await files.config.write({ ...current, defaultRegion: options.value });
    console.log(`defaultRegion = ${options.value}`);
  },
});
