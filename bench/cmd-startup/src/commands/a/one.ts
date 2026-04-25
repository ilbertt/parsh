import { defineCommand } from '@repo/core';

export const command = defineCommand('a one', {
  options: {},
  handler: (ctx) => {
    console.log(`a one`);
  },
});
