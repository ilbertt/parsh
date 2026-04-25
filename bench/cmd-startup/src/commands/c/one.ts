import { defineCommand } from '@repo/core';

export const command = defineCommand('c one', {
  options: {},
  handler: (ctx) => {
    console.log(`c one`);
  },
});
