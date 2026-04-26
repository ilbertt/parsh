import { defineCommand } from '@repo/core';
import { ensureConfig } from '../../hooks/ensure-config.ts';

export const command = defineCommand('config get', {
  description: 'Print the current configuration.',
  options: {},
  beforeHandler: ensureConfig,
  handler: async ({ files, print }) => {
    const cfg = await files.config.read();
    print.dim(`config file: ${files.config.path}`);
    print.info(JSON.stringify(cfg, null, 2));
  },
});
