import { defineCommand } from '@repo/core';

export const command = defineCommand('version', {
  description: "Print the CLI version. Doesn't read any env var.",
  options: {},
  handler: ({ print }) => {
    print.info('0.0.1');
  },
});
