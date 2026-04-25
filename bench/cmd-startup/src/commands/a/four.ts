import { defineCommand } from '@repo/core';

export const command = defineCommand('a four', {
  options: {},
  handler: (ctx) => {
    console.log(`a four`);
  },
});
