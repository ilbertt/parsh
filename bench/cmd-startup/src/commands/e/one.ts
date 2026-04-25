import { defineCommand } from '@repo/core';

export const command = defineCommand('e one', {
  options: {},
  handler: (ctx) => {
    console.log(`e one`);
  },
});
