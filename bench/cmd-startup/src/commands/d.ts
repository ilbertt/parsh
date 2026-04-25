import { defineCommand } from '@repo/core';

export const command = defineCommand('d', {
  options: {},
  handler: (ctx) => {
    console.log(`d`);
  },
});
