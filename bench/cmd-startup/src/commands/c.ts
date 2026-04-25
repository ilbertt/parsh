import { defineCommand } from '@repo/core';

export const command = defineCommand('c', {
  options: {},
  handler: (ctx) => {
    console.log(`c`);
  },
});
