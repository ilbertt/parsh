import { defineCommand } from '@repo/core';

export const command = defineCommand('d two', {
  options: {},
  handler: (ctx) => {
    console.log(`d two`);
  },
});
