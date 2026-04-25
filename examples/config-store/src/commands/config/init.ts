import { defineCommand } from '@repo/core';
import { DEFAULT_CONFIG } from '../../files.ts';

export const command = defineCommand('config init', {
  description: 'Create the config file with default values.',
  options: {},
  handler: async ({ files }) => {
    await files.config.write(DEFAULT_CONFIG);
    console.log(`wrote ${files.config.path}`);
  },
});
