import { defineCommand } from '@repo/core';
import { DEFAULT_CONFIG } from '../../files.ts';

export const command = defineCommand('config init', {
  description: 'Create the config file with default values.',
  options: {},
  handler: async ({ files, print }) => {
    await files.config.write(DEFAULT_CONFIG);
    print.success(`wrote ${files.config.path}`);
  },
});
