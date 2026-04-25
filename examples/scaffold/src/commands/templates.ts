import { defineCommand } from '@repo/core';

export const command = defineCommand('templates', {
  description: 'Inspect available scaffold templates.',
  options: {},
  handler: () => {
    console.log('Use `scaffold templates list` or `scaffold templates <name> show`.');
  },
});
