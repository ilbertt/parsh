import { defineCommand } from '@repo/core';

export const command = defineCommand('c two', {
  options: {},
  handler: (ctx) => {
    console.log(`c two`);
  },
});
