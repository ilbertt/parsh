import { defineCommand } from '@repo/core';

export const command = defineCommand('b four', {
  options: {},
  handler: (ctx) => {
    console.log(`b four`);
  },
});
