import { defineCommand } from '@repo/core';

export const command = defineCommand('d one', {
  options: {},
  handler: (ctx) => {
    console.log(`d one`);
  },
});
