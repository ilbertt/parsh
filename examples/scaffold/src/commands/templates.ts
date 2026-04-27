import { defineCommand } from '@parshjs/core';

export const command = defineCommand('templates', {
  description: 'Inspect available scaffold templates.',
  options: {},
  handler: ({ print }) => {
    print.info('Use `scaffold templates list` or `scaffold templates <name> show`.');
  },
});
