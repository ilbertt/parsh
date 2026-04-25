import { defineCommand } from '@repo/core';

export const command = defineCommand('config set', {
  description: 'Update a config field.',
  options: {},
});
