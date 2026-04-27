import { defineCommand } from '@parshjs/core';

export const command = defineCommand('config', {
  description: 'Manage CLI configuration stored on disk.',
  options: {},
});
