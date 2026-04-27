import { defineCommand } from '@parshjs/core';

export const command = defineCommand('config set', {
  description: 'Update a config field.',
  options: {},
});
