import { defineCommand } from '@repo/core';

export const command = defineCommand('e two', {
  options: {},
  handler: (ctx) => {
    console.log(`e two`);
  },
});
