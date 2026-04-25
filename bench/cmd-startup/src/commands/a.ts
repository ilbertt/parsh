import { defineCommand } from '@repo/core';

export const command = defineCommand('a', {
  options: {},
  handler: (ctx) => {
    console.log(`a`);
  },
});
