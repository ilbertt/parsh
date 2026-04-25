import { defineCommand } from '@repo/core';

export const command = defineCommand('b two', {
  options: {},
  handler: (ctx) => {
    console.log(`b two`);
  },
});
