import { defineCommand } from '@repo/core';

export const command = defineCommand('b one', {
  options: {},
  handler: (ctx) => {
    console.log(`b one`);
  },
});
