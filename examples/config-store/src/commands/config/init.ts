import { defineCommand } from '@parshjs/core';
import { DEFAULT_CONFIG } from '../../files.ts';

export const command = defineCommand('config init', {
  description: 'Create the config file with default values.',
  options: {},
  handler: async ({ context, print }) => {
    await context.files.config.write(DEFAULT_CONFIG);
    print.success(`wrote ${context.files.config.path}`);
  },
});
